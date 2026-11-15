import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createMikroTikAdapter, safeRouterError } from "../services/mikrotik-api.js";

const b64 = value => Buffer.from(value).toString("base64url");
function key() {
  const raw = process.env.ROUTER_CREDENTIAL_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("ROUTER_CREDENTIAL_KEY must be a 32-byte hex secret.");
  return Buffer.from(raw, "hex");
}
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [b64(iv), b64(cipher.getAuthTag()), b64(data)].join(".");
}
function decrypt(value) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Stored router credentials are invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
export const credentialCrypto = { encrypt, decrypt };

export function registerMikroTikRoutes(app, { db, auth, id, audit, fail }) {
  // Router inventory CRUD is registered by operations.routes.js. This module
  // handles only encrypted credentials and explicit connectivity tests.
  app.post("/api/v1/routers/:id/credentials", auth, (req, res) => {
    const router = db.prepare("SELECT id FROM routers WHERE id=? AND tenant_id=?").get(req.params.id, req.user.tenant_id);
    if (!router) return fail(res, 404, "Router not found.");
    const username = req.body?.username, password = req.body?.password;
    if (typeof username !== "string" || !username.trim() || username.length > 128 ||
        typeof password !== "string" || !password || password.length > 512) {
      return fail(res, 400, "Valid router username and password are required.");
    }
    let encrypted;
    try { encrypted = { username: encrypt(username.trim()), password: encrypt(password) }; }
    catch (error) { return fail(res, 503, safeRouterError(error)); }
    db.prepare("UPDATE routers SET credential_username=?,credential_password=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?")
      .run(encrypted.username, encrypted.password, router.id, req.user.tenant_id);
    audit(req.user, "update_credentials", "router", router.id);
    res.json({ success: true, message: "Router credentials saved securely." });
  });

  app.post("/api/v1/routers/:id/test", auth, async (req, res) => {
    const router = db.prepare("SELECT id,name,host,api_port,credential_username,credential_password FROM routers WHERE id=? AND tenant_id=?")
      .get(req.params.id, req.user.tenant_id);
    if (!router) return fail(res, 404, "Router not found.");
    if (!router.credential_username || !router.credential_password) {
      return fail(res, 409, "Router credentials have not been configured.");
    }
    let client;
    try {
      const username = decrypt(router.credential_username);
      const password = decrypt(router.credential_password);
      client = createMikroTikAdapter({
        host: router.host,
        port: router.api_port,
        username,
        password,
        timeout: 8000
      });
      await client.connect();
      const details = await client.test();
      db.prepare("INSERT INTO router_connection_logs(id,tenant_id,router_id,actor_user_id,action,status,detail) VALUES(?,?,?,?,?,?,?)")
        .run(id(), req.user.tenant_id, router.id, req.user.id, "connect_test", "success",
          JSON.stringify({ identity: details.identity, version: details.version, board: details.board }));
      audit(req.user, "connect_test", "router", router.id);
      res.json({ success: true, data: { routerId: router.id, name: router.name, ...details } });
    } catch (error) {
      const message = safeRouterError(error);
      try {
        db.prepare("INSERT INTO router_connection_logs(id,tenant_id,router_id,actor_user_id,action,status,detail) VALUES(?,?,?,?,?,?,?)")
          .run(id(), req.user.tenant_id, router.id, req.user.id, "connect_test", "error", message);
      } catch { /* connection failure must still be returned to the caller */ }
      audit(req.user, "connect_test_failed", "router", router.id);
      fail(res, 502, message);
    } finally {
      client?.close();
    }
  });
}
