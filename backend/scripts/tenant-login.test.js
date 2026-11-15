import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID, scryptSync } from "node:crypto";

const dir = mkdtempSync(join(tmpdir(), "nexus-auth-tenant-"));
process.env.SQLITE_PATH = join(dir, "auth.sqlite");
process.env.CORS_ORIGINS = "http://localhost";
const { default: app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const server = app.listen(0);
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
try {
  const setup = await fetch(base + "/api/v1/setup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Tenant Alpha", fullName: "Alpha Owner", email: "shared@example.test", password: "Strong-Password-123" })
  });
  assert.equal(setup.status, 201);
  const tenantId = randomUUID();
  const userId = randomUUID();
  const salt = randomUUID().replaceAll("-", "");
  const password = "Strong-Password-456";
  const hash = salt + ":" + scryptSync(password, salt, 64).toString("hex");
  db.prepare("INSERT INTO tenants(id,name,slug) VALUES(?,?,?)").run(tenantId, "Tenant Beta", "tenant-beta");
  db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,full_name,role) VALUES(?,?,?,?,?,'owner')")
    .run(userId, tenantId, "shared@example.test", hash, "Beta Owner");

  const ambiguous = await fetch(base + "/api/v1/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "shared@example.test", password: "Strong-Password-123" })
  });
  assert.equal(ambiguous.status, 409, "Duplicate email across tenants must never select the oldest account silently.");

  const unique = await fetch(base + "/api/v1/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "shared@example.test", password: "wrong-password" })
  });
  assert.equal(unique.status, 409, "Ambiguous identity must be rejected before password-based account selection.");
  const other = await fetch(base + "/api/v1/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "beta-only@example.test", password: "wrong-password" })
  });
  assert.equal(other.status, 401);
  console.log("Tenant-aware login selection tests passed.");
} finally {
  await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
