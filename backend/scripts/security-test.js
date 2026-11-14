import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID, scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "nexus-security-"));
process.env.SQLITE_PATH = join(dir, "security.sqlite");
process.env.CORS_ORIGINS = "http://localhost";
let db;
let server;
let base;
const req = async (path, method = "GET", body, token) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  return { status: response.status, data, headers: response.headers };
};
try {
  const { default: app } = await import("../src/app.js");
  ({ db } = await import("../src/config/database.js"));
  server = app.listen(0);
  await once(server, "listening");
  base = "http://127.0.0.1:" + server.address().port;

  const first = await req("/api/v1/setup", "POST", {
    companyName: "Tenant One Test", fullName: "Owner One",
    email: "owner-one@example.test", password: "Strong-Test-Password-123"
  });
  assert.equal(first.status, 201);
  const tokenOne = first.data.token;
  assert.equal((await req("/api/v1/auth/login", "POST", { email: "owner-one@example.test", password: "wrong-password" })).status, 401, "Invalid credentials must be rejected.");
  const customerOne = await req("/api/v1/customers", "POST", { fullName: "Synthetic Subscriber One" }, tokenOne);
  assert.equal(customerOne.status, 201);
  const packageOne = await req("/api/v1/packages", "POST", {
    name: "Synthetic 10M", speedDownMbps: 10, speedUpMbps: 10, monthlyPricePkr: 1000
  }, tokenOne);
  assert.equal(packageOne.status, 201);
  const invoiceOne = await req("/api/v1/invoices", "POST", {
    customerId: customerOne.data.data.id, amountPkr: 1000
  }, tokenOne);
  assert.equal(invoiceOne.status, 201);
  const paymentOne = await req("/api/v1/payments", "POST", { invoiceId: invoiceOne.data.data.id, amountPkr: 100, method: "cash" }, tokenOne);
  assert.equal(paymentOne.status, 201);
  const ticketOne = await req("/api/v1/tickets", "POST", {
    customerId: customerOne.data.data.id, subject: "Synthetic test complaint"
  }, tokenOne);
  assert.equal(ticketOne.status, 201);
  const routerOne = await req("/api/v1/routers", "POST", {
    name: "Synthetic Router", host: "192.0.2.10", apiPort: 8728
  }, tokenOne);
  assert.equal(routerOne.status, 201);

  const tenantTwo = randomUUID();
  const ownerTwo = randomUUID();
  const salt = randomUUID().replaceAll("-", "");
  const password = "Strong-Test-Password-456";
  const passwordHash = salt + ":" + scryptSync(password, salt, 64).toString("hex");
  db.prepare("INSERT INTO tenants(id,name,slug) VALUES(?,?,?)").run(tenantTwo, "Tenant Two Test", "tenant-two-" + tenantTwo.slice(0, 8));
  db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,full_name,role) VALUES(?,?,?,?,?,'owner')")
    .run(ownerTwo, tenantTwo, "owner-two@example.test", passwordHash, "Owner Two");
  const loginTwo = await req("/api/v1/auth/login", "POST", { email: "owner-two@example.test", password });
  assert.equal(loginTwo.status, 200);
  const tokenTwo = loginTwo.data.token;

  assert.equal((await req("/api/v1/customers", "GET", undefined, tokenTwo)).data.data.length, 0);
  assert.equal((await req("/api/v1/customers/" + customerOne.data.data.id, "GET", undefined, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/customers/" + customerOne.data.data.id, "PATCH", { fullName: "Tampered" }, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/customers/" + customerOne.data.data.id, "DELETE", undefined, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/packages", "GET", undefined, tokenTwo)).data.data.length, 0);
  assert.equal((await req("/api/v1/subscriptions", "POST", {
    customerId: customerOne.data.data.id, packageId: packageOne.data.data.id
  }, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/invoices", "POST", {
    customerId: customerOne.data.data.id, amountPkr: 500
  }, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/tickets", "POST", {
    customerId: customerOne.data.data.id, subject: "Cross-tenant attempt"
  }, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/routers", "GET", undefined, tokenTwo)).data.data.length, 0);
  assert.equal((await req("/api/v1/routers/" + routerOne.data.data.id, "PATCH", { status: "disabled" }, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/tickets/" + ticketOne.data.data.id, "PATCH", { status: "closed" }, tokenTwo)).status, 404);
  assert.equal((await req("/api/v1/audit-logs", "GET", undefined, tokenTwo)).data.data.length, 0);
  const portalProbe = await req("/api/v1/customer-portal/me", "GET", undefined, tokenOne);
  assert.equal(portalProbe.status, 404, "Customer portal is not implemented; do not treat portal IDOR coverage as passed.");
  const exportTwo = await fetch(base + "/api/v1/exports/customers.csv", { headers: { Authorization: "Bearer " + tokenTwo } });
  assert.equal(exportTwo.status, 200);
  assert.doesNotMatch(await exportTwo.text(), /Synthetic Subscriber One/);

  assert.equal((await req("/api/v1/dashboard", "GET", undefined, tokenTwo)).data.stats.customers, 0);
  db.prepare("UPDATE users SET status='disabled' WHERE id=?").run(ownerTwo);
  assert.equal((await req("/api/v1/auth/me", "GET", undefined, tokenTwo)).status, 401, "Disabled accounts must lose access immediately.");
  assert.equal((await req("/api/v1/auth/login", "POST", { email: "owner-two@example.test", password })).status, 401, "Disabled accounts must not sign in.");
  const portalProbe = await req("/api/v1/customer-portal/me", "GET", undefined, tokenOne);
  assert.equal(portalProbe.status, 404, "Customer portal is not implemented; do not treat portal IDOR coverage as passed.");
  assert.equal((await req("/api/v1/auth/me")).status, 401);
  assert.equal((await req("/api/v1/customers")).headers.get("x-content-type-options"), "nosniff");
  assert.equal((await req("/api/v1/customers")).headers.get("x-frame-options"), "SAMEORIGIN");
  for (let i = 0; i < 9; i++) {
    const attempt = await req("/api/v1/auth/login", "POST", { email: "missing@example.test", password: "wrong-password" });
    assert.equal(attempt.status, 401);
  }
  const throttled = await req("/api/v1/auth/login", "POST", { email: "missing@example.test", password: "wrong-password" });
  assert.equal(throttled.status, 429, "Authentication limiter must block the 11th login attempt.");
  const passwordChange = await req("/api/v1/auth/password", "PUT", { currentPassword: "Strong-Test-Password-123", newPassword: "New-Strong-Test-Password-789" }, tokenOne);
  assert.equal(passwordChange.status, 200, "Password changes must succeed with the current password.");
  assert.equal((await req("/api/v1/auth/me", "GET", undefined, tokenOne)).status, 401, "Password changes must revoke all existing sessions.");
  assert.equal((await req("/api/v1/auth/login", "POST", { email: "owner-one@example.test", password: "Strong-Test-Password-123" })).status, 401, "The old password must stop working.");
  const newLogin = await req("/api/v1/auth/login", "POST", { email: "owner-one@example.test", password: "New-Strong-Test-Password-789" });
  assert.equal(newLogin.status, 200, "The new password must authenticate.");
  assert.equal((await req("/api/v1/auth/logout", "POST", {}, newLogin.data.token)).status, 200);
  assert.equal((await req("/api/v1/auth/me", "GET", undefined, newLogin.data.token)).status, 401, "Logout must revoke the issued token.");

  const invalidProduction = spawnSync(process.execPath, ["--input-type=module", "-e", 'import("./src/config/env.js")'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", CORS_ORIGINS: "http://localhost", SQLITE_PATH: "./data/nexus.sqlite", SQLITE_BACKUP_DIR: "./backups" },
    encoding: "utf8"
  });
  assert.notEqual(invalidProduction.status, 0, "Unsafe production defaults must be rejected.");
  assert.match(invalidProduction.stderr, /HTTPS origins only/);
  const validProduction = spawnSync(process.execPath, ["--input-type=module", "-e", 'import("./src/config/env.js")'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", CORS_ORIGINS: "https://app.example.test", SQLITE_PATH: "/tmp/nexus.sqlite", SQLITE_BACKUP_DIR: "/tmp/nexus-backups" },
    encoding: "utf8"
  });
  assert.equal(validProduction.status, 0, validProduction.stderr);

  console.log("NEXUS security tests passed: invalid login, disabled accounts, cross-tenant isolation, exports, password changes, session revocation and baseline security headers. Customer-portal cross-customer IDOR remains blocked because no portal endpoint exists.");
} finally {
  if (server) {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
  db?.close();
  rmSync(dir, { recursive: true, force: true });
}
