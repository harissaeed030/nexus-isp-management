import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createMikroTikAdapter, safeRouterError } from "../services/mikrotik-api.js";
import { MikroTikReadOnlyAdapter } from "../services/mikrotik-readonly-adapter.js";

const b64 = value => Buffer.from(value).toString("base64url");

function key() {
  const raw = process.env.ROUTER_CREDENTIAL_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error("ROUTER_CREDENTIAL_KEY must be a 32-byte hex secret.");
  }
  return Buffer.from(raw, "hex");
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [b64(iv), b64(cipher.getAuthTag()), b64(data)].join(".");
}

function decodeBase64Url(segment, expectedLength, label) {
  if (typeof segment !== "string" || !/^[A-Za-z0-9_-]*$/.test(segment) ||
      segment.length % 4 === 1) {
    throw new Error("Stored router credentials are invalid.");
  }
  const decoded = Buffer.from(segment, "base64url");
  if (decoded.toString("base64url") !== segment ||
      (expectedLength !== null && decoded.length !== expectedLength)) {
    throw new Error("Stored router credentials are invalid.");
  }
  return decoded;
}

function decrypt(value) {
  if (typeof value !== "string") {
    throw new Error("Stored router credentials are invalid.");
  }
  const parts = value.split(".");
  if (parts.length !== 3) {
    throw new Error("Stored router credentials are invalid.");
  }
  const [ivPart, tagPart, dataPart] = parts;
  const iv = decodeBase64Url(ivPart, 12, "IV");
  const tag = decodeBase64Url(tagPart, 16, "authentication tag");
  const data = decodeBase64Url(dataPart, null, "ciphertext");

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(data),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("Stored router credentials failed authentication.");
  }
}

export const credentialCrypto = { encrypt, decrypt };

const validPppoeName = value =>
  typeof value === "string" && /^[a-zA-Z0-9_.@-]{1,64}$/.test(value);

function validProfile(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_. -]{1,64}$/.test(value);
}

export function registerMikroTikRoutes(app, { db, auth, id, audit, fail }) {
  const getRouter = (routerId, tenantId) =>
    db.prepare("SELECT * FROM routers WHERE id=? AND tenant_id=?").get(routerId, tenantId);

  const credentials = router => ({
    host: router.host,
    port: router.api_port,
    username: decrypt(router.credential_username),
    password: decrypt(router.credential_password),
    timeout: 8000,
    tlsOptions: { rejectUnauthorized: true }
  });

  const log = (user, routerId, action, status, detail) => {
    db.prepare(
      "INSERT INTO router_connection_logs(id,tenant_id,router_id,actor_user_id,action,status,detail) VALUES(?,?,?,?,?,?,?)"
    ).run(id(), user.tenant_id, routerId, user.id, action, status,
      detail ? String(detail).slice(0, 240) : null);
  };

  const adapter = process.env.NEXUS_ROUTER_ADAPTER === "mock" ? null : createMikroTikAdapter;

  async function withRouter(router, operation) {
    if (!adapter) throw new Error("Live MikroTik adapter is disabled.");
    const api = adapter(credentials(router));
    try {
      await api.connect();
      return await operation(api);
    } finally {
      api.close();
    }
  }

  function read(capability) {
    return async (req, res) => {
      const router = getRouter(req.params.id, req.user.tenant_id);
      if (!router) return fail(res, 404, "Router not found.");
      try {
        const data = await withRouter(router, api =>
          new MikroTikReadOnlyAdapter(api).read(capability));
        log(req.user, router.id, capability, "success", null);
        return res.json({ success: true, source: "live", data });
      } catch (error) {
        const message = safeRouterError(error);
        log(req.user, router.id, capability, "error", message);
        return fail(res, 502, "Router read failed: " + message);
      }
    };
  }

  app.get("/api/v1/routers/:id/logs", auth, (req, res) => {
    if (!getRouter(req.params.id, req.user.tenant_id)) {
      return fail(res, 404, "Router not found.");
    }
    const rows = db.prepare(
      "SELECT id,action,status,detail,created_at FROM router_connection_logs WHERE tenant_id=? AND router_id=? ORDER BY created_at DESC LIMIT 100"
    ).all(req.user.tenant_id, req.params.id);
    return res.json({ success: true, data: rows });
  });

  app.post("/api/v1/routers/:id/test", auth, async (req, res) => {
    const router = getRouter(req.params.id, req.user.tenant_id);
    if (!router) return fail(res, 404, "Router not found.");
    try {
      const result = await withRouter(router, api => api.test());
      log(req.user, router.id, "connection_test", "success", "Live RouterOS API connection verified");
      db.prepare("UPDATE routers SET status='online',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?")
        .run(router.id, req.user.tenant_id);
      return res.json({ success: true, source: "live", data: result });
    } catch (error) {
      const message = safeRouterError(error);
      log(req.user, router.id, "connection_test", "error", message);
      db.prepare("UPDATE routers SET status='offline',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?")
        .run(router.id, req.user.tenant_id);
      return res.status(502).json({
        success: false,
        error: "Router connection failed.",
        detail: message,
        source: "live"
      });
    }
  });

  app.get("/api/v1/routers/:id/identity", auth,
    read("mikrotik.identity.read"));
  app.get("/api/v1/routers/:id/resource", auth,
    read("mikrotik.resource.read"));
  app.get("/api/v1/routers/:id/interfaces", auth,
    read("mikrotik.interfaces.read"));
  app.get("/api/v1/routers/:id/pppoe/active", auth,
    read("mikrotik.pppoe.sessions.read"));
  app.get("/api/v1/routers/:id/pppoe/secrets", auth,
    read("mikrotik.pppoe.secrets.read"));
  app.get("/api/v1/routers/:id/pppoe/profiles", auth,
    read("mikrotik.pppoe.profiles.read"));

  app.post("/api/v1/routers/:id/pppoe/secrets", auth, async (req, res) => {
    const body = req.body || {};
    if (!validPppoeName(body.name) || typeof body.password !== "string" ||
        body.password.length < 8 || body.password.length > 128 || !validProfile(body.profile)) {
      return fail(res, 400, "Invalid PPPoE username, password or profile.");
    }
    const router = getRouter(req.params.id, req.user.tenant_id);
    if (!router) return fail(res, 404, "Router not found.");
    try {
      const data = await withRouter(router, api => api.command("/ppp/secret/add", {
        name: body.name,
        password: body.password,
        profile: body.profile,
        service: "pppoe",
        disabled: "no"
      }));
      log(req.user, router.id, "create_pppoe_user", "success", null);
      return res.status(201).json({ success: true, source: "live", data });
    } catch (error) {
      const message = safeRouterError(error);
      log(req.user, router.id, "create_pppoe_user", "error", message);
      return fail(res, 502, "PPPoE user creation failed: " + message);
    }
  });

  async function setSecret(api, name, fields) {
    const found = await api.command("/ppp/secret/print", {
      "?name": name,
      ".proplist": ".id,name"
    });
    const match = found.find(row => row.name === name);
    if (!match) throw new Error("PPPoE secret not found.");
    return api.command("/ppp/secret/set", { ".id": match[".id"], ...fields });
  }

  app.patch("/api/v1/routers/:id/pppoe/secrets/:name", auth, async (req, res) => {
    const fields = {};
    const body = req.body || {};
    if (body.password !== undefined) {
      if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
        return fail(res, 400, "Password must be 8–128 characters.");
      }
      fields.password = body.password;
    }
    if (body.profile !== undefined) {
      if (!validProfile(body.profile)) return fail(res, 400, "Invalid profile.");
      fields.profile = body.profile;
    }
    if (!Object.keys(fields).length) return fail(res, 400, "Provide a password or profile change.");
    if (!validPppoeName(req.params.name)) return fail(res, 400, "Invalid PPPoE username.");
    const router = getRouter(req.params.id, req.user.tenant_id);
    if (!router) return fail(res, 404, "Router not found.");
    try {
      const data = await withRouter(router, api => setSecret(api, req.params.name, fields));
      log(req.user, router.id, "update_pppoe_user", "success", null);
      return res.json({ success: true, source: "live", data });
    } catch (error) {
      const message = safeRouterError(error);
      log(req.user, router.id, "update_pppoe_user", "error", message);
      return fail(res, 502, "PPPoE user update failed: " + message);
    }
  });

  for (const [action, disabled] of [["suspend", "yes"], ["restore", "no"]]) {
    app.post("/api/v1/routers/:id/pppoe/secrets/:name/" + action, auth, async (req, res) => {
      if (!validPppoeName(req.params.name)) return fail(res, 400, "Invalid PPPoE username.");
      const router = getRouter(req.params.id, req.user.tenant_id);
      if (!router) return fail(res, 404, "Router not found.");
      try {
        const data = await withRouter(router, api =>
          setSecret(api, req.params.name, { disabled }));
        log(req.user, router.id, action + "_pppoe_user", "success", null);
        return res.json({ success: true, source: "live", data });
      } catch (error) {
        const message = safeRouterError(error);
        log(req.user, router.id, action + "_pppoe_user", "error", message);
        return fail(res, 502, "PPPoE " + action + " failed: " + message);
      }
    });
  }

  app.post("/api/v1/routers/:id/customers/:customerId/pppoe", auth, (req, res) => {
    const router = getRouter(req.params.id, req.user.tenant_id);
    if (!router) return fail(res, 404, "Router not found.");
    const customer = db.prepare(
      "SELECT id FROM customers WHERE id=? AND tenant_id=?"
    ).get(req.params.customerId, req.user.tenant_id);
    if (!customer) return fail(res, 404, "Customer not found.");
    const username = req.body?.username;
    if (!validPppoeName(username)) return fail(res, 400, "Valid PPPoE username is required.");
    try {
      db.prepare("UPDATE customers SET pppoe_username=?,pppoe_router_id=? WHERE id=? AND tenant_id=?")
        .run(username, router.id, customer.id, req.user.tenant_id);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        return fail(res, 409, "This PPPoE username is already mapped to another customer.");
      }
      throw error;
    }
    audit(req.user, "map_pppoe", "customer", customer.id);
    return res.json({
      success: true,
      data: { customerId: customer.id, routerId: router.id, pppoeUsername: username }
    });
  });

  app.get("/api/v1/routers/:id/sync", auth, async (req, res) => {
    const router = getRouter(req.params.id, req.user.tenant_id);
    if (!router) return fail(res, 404, "Router not found.");
    try {
      const [active, secrets] = await withRouter(router, async api => Promise.all([
        api.command("/ppp/active/print", {
          ".proplist": "name,address,uptime,service,caller-id"
        }),
        api.command("/ppp/secret/print", {
          ".proplist": "name,profile,disabled,service"
        })
      ]));
      const activeNames = new Set(active.map(row => row.name));
      const mapped = db.prepare(
        "SELECT id,pppoe_username,connection_status FROM customers WHERE tenant_id=? AND pppoe_router_id=? AND pppoe_username IS NOT NULL"
      ).all(req.user.tenant_id, router.id);
      let updatedCustomers = 0;
      for (const customer of mapped) {
        const next = activeNames.has(customer.pppoe_username) ? "active" : "disconnected";
        if (customer.connection_status === next) continue;
        db.prepare("UPDATE customers SET connection_status=? WHERE id=? AND tenant_id=?")
          .run(next, customer.id, req.user.tenant_id);
        db.prepare(
          "INSERT INTO customer_connection_history(id,tenant_id,customer_id,event_type,old_status,new_status,notes,actor_user_id) VALUES(?,?,?,?,?,?,?,?)"
        ).run(id(), req.user.tenant_id, customer.id, "router_sync",
          customer.connection_status, next,
          "Synchronized from live RouterOS PPPoE active sessions", req.user.id);
        updatedCustomers++;
      }
      log(req.user, router.id, "sync", "success", null);
      return res.json({
        success: true,
        source: "live",
        data: {
          active,
          secrets,
          mappedCustomers: mapped.length,
          updatedCustomers,
          checkedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      const message = safeRouterError(error);
      log(req.user, router.id, "sync", "error", message);
      return fail(res, 502, "Router synchronization failed: " + message);
    }
  });
}
