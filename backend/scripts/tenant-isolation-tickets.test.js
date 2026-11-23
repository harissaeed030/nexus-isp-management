import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { permissionFor } from "../src/lib/permissions.js";
import { once } from "node:events";

assert.equal(permissionFor("/api/v1/unallocated-payments","POST"),"billing.adjust");
assert.equal(permissionFor("/api/v1/unallocated-payments/123/allocate","POST"),"billing.reconcile");
assert.equal(permissionFor("/api/v1/unallocated-payments","GET"),"billing.read");

const dir = mkdtempSync(join(tmpdir(), "nexus-isolation-"));
process.env.SQLITE_PATH = join(dir, "test.sqlite");
process.env.CORS_ORIGINS = "http://localhost";
const { default: app } = await import("../src/app.js");
const { db } = await import("../src/config/database.js");
const server = app.listen(0);
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
const request = async (path, method = "GET", body, token) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};

try {
  const a = await request("/api/v1/setup", "POST", { companyName: "ISP Alpha", fullName: "Alpha Owner", email: "owner@alpha.test", password: "Alpha-Password-123" });
  assert.equal(a.status, 201);
  const b = await request("/api/v1/tenants/register", "POST", { companyName: "ISP Beta", fullName: "Beta Owner", email: "owner@beta.test", password: "Beta-Password-123" });
  assert.equal(b.status, 201);
  const ta = a.data.token, tb = b.data.token;

  // Tenant A data
  const pkg = (await request("/api/v1/packages", "POST", { name: "10 Mbps", speedDownMbps: 10, speedUpMbps: 10, monthlyPricePkr: 1500 }, ta)).data.data;
  const cust = (await request("/api/v1/customers", "POST", { fullName: "Alpha Customer" }, ta)).data.data;
  const inv = (await request("/api/v1/invoices", "POST", { customerId: cust.id, amountPkr: 1500 }, ta)).data.data;
  const pay = await request("/api/v1/payments", "POST", { invoiceId: inv.id, amountPkr: 500, method: "cash" }, ta);
  assert.equal(pay.status, 201);
  const sub = await request("/api/v1/subscriptions", "POST", { customerId: cust.id, packageId: pkg.id, status: "active" }, ta);
  assert.equal(sub.status, 201);

  // Tenant isolation: B cannot see or touch A's records
  for (const path of ["/api/v1/customers", "/api/v1/packages", "/api/v1/invoices", "/api/v1/payments", "/api/v1/subscriptions", "/api/v1/tickets"]) {
    const list = await request(path, "GET", undefined, tb);
    assert.equal(list.status, 200, path);
    assert.equal(list.data.data.length, 0, "tenant B must see no tenant A rows in " + path);
  }
  assert.equal((await request("/api/v1/customers/" + cust.id, "GET", undefined, tb)).status, 404);
  assert.equal((await request("/api/v1/customers/" + cust.id, "PATCH", { fullName: "Hacked" }, tb)).status, 404);
  assert.equal((await request("/api/v1/customers/" + cust.id, "DELETE", undefined, tb)).status, 404);
  assert.equal((await request("/api/v1/packages/" + pkg.id, "PATCH", { name: "Hacked" }, tb)).status, 404);
  assert.equal((await request("/api/v1/payments", "POST", { invoiceId: inv.id, amountPkr: 100, method: "cash" }, tb)).status, 404);
  assert.equal((await request("/api/v1/invoices", "POST", { customerId: cust.id, amountPkr: 100 }, tb)).status, 404);
  assert.equal((await request("/api/v1/tickets", "POST", { customerId: cust.id, subject: "x" }, tb)).status, 404);
  assert.equal((await request("/api/v1/subscriptions", "POST", { customerId: cust.id, packageId: pkg.id, status: "active" }, tb)).status, 404);
  assert.equal((await request("/api/v1/customers/" + cust.id, "GET", undefined, ta)).data.data.full_name ?? (await request("/api/v1/customers/" + cust.id, "GET", undefined, ta)).data.data.fullName, "Alpha Customer", "tenant A record unchanged");
  assert.equal((await request("/api/v1/dashboard", "GET", undefined, tb)).data.stats.customers, 0);
  assert.equal((await request("/api/v1/audit-logs", "GET", undefined, tb)).data.data.some(x => x.resource_id === cust.id), false);
  assert.equal((await request("/api/v1/customers", "GET")).status, 401, "unauthenticated access rejected");

  // Roles
  const tech = await request("/api/v1/staff", "POST", { fullName: "Tech One", email: "tech@alpha.test", password: "Tech-Password-1234", role: "technician" }, ta);
  assert.equal(tech.status, 201);
  const acct = await request("/api/v1/staff", "POST", { fullName: "Billing One", email: "bill@alpha.test", password: "Bill-Password-1234", role: "billing" }, ta);
  assert.equal(acct.status, 201);
  const noc = await request("/api/v1/staff", "POST", { fullName: "NOC One", email: "noc@alpha.test", password: "Noc-Password-1234", role: "noc" }, ta);
  assert.equal(noc.status, 201);
  const techLogin = (await request("/api/v1/auth/login", "POST", { email: "tech@alpha.test", password: "Tech-Password-1234" })).data;
  const billLogin = (await request("/api/v1/auth/login", "POST", { email: "bill@alpha.test", password: "Bill-Password-1234" })).data;
  const nocLogin = (await request("/api/v1/auth/login", "POST", { email: "noc@alpha.test", password: "Noc-Password-1234" })).data;
  let tt = techLogin.token; const tbill = billLogin.token; const tn = nocLogin.token;
  assert.equal((await request("/api/v1/payments", "POST", { invoiceId: inv.id, amountPkr: 100, method: "cash" }, tt)).status, 403, "technician cannot record payments");
  assert.equal((await request("/api/v1/packages", "POST", { name: "x", speedDownMbps: 1, speedUpMbps: 1, monthlyPricePkr: 1 }, tt)).status, 403);
  assert.equal((await request("/api/v1/staff", "GET", undefined, tt)).status, 403, "technician cannot manage staff");
  assert.equal((await request("/api/v1/staff", "GET", undefined, tbill)).status, 403, "billing role cannot manage staff");
  assert.equal((await request("/api/v1/payments", "POST", { invoiceId: inv.id, amountPkr: 100, method: "cash" }, tbill)).status, 201, "billing role records payments");
  assert.equal((await request("/api/v1/acs/connections", "POST", {}, tt)).status, 403, "technician cannot manage ACS connections");
  assert.equal((await request("/api/v1/acs/connections", "GET", undefined, tn)).status, 200, "NOC can view ACS connections");
  assert.equal((await request("/api/v1/acs/connections", "POST", {}, tn)).status, 400, "NOC can manage ACS connections; empty payload reaches validation");
  const dash = (await request("/api/v1/dashboard", "GET", undefined, ta)).data.stats;
  assert.equal(dash.dailyCollectionPkr, 600, "daily collection counts today's payments");
  assert.equal(dash.monthlyCollectionPkr, 600);
  assert.equal(dash.outstandingPkr, 900, "outstanding = invoice minus payments");
  assert.equal(dash.suspendedCustomers, 0);
  assert.equal(dash.expiringSubscriptions, 0);
  db.prepare("UPDATE subscriptions SET expires_at=date('now','+3 days') WHERE tenant_id=?").run(db.prepare("SELECT tenant_id FROM users WHERE email=?").get("owner@alpha.test").tenant_id);
  assert.equal((await request("/api/v1/dashboard", "GET", undefined, ta)).data.stats.expiringSubscriptions, 1, "subscription expiring within 7 days counted");
  assert.equal((await request("/api/v1/dashboard", "GET", undefined, tb)).data.stats.expiringSubscriptions, 0, "other tenant unaffected");
  assert.equal((await request("/api/v1/customers", "POST", { fullName: "Nope" }, tbill)).status, 403, "billing role cannot create customers");
  assert.equal((await request("/api/v1/tickets", "GET", undefined, tt)).status, 200, "technician sees complaints");

  // Complaints: numbering, assignment, history
  const t1 = (await request("/api/v1/tickets", "POST", { customerId: cust.id, subject: "No internet", priority: "high" }, ta)).data.data;
  const t2 = (await request("/api/v1/tickets", "POST", { customerId: cust.id, subject: "Slow speed" }, ta)).data.data;
  assert.match(t1.ticket_number, /^TKT-\d{6}$/);
  assert.notEqual(t1.ticket_number, t2.ticket_number);
  const cust2 = (await request("/api/v1/customers", "POST", { fullName: "Beta Customer" }, tb)).data.data;
  const tBeta = (await request("/api/v1/tickets", "POST", { customerId: cust2.id, subject: "Beta ticket" }, tb)).data.data;
  assert.equal(tBeta.ticket_number, "TKT-000001", "ticket numbers are per tenant");

  const techId = tech.data.data?.id ?? techLogin.user.id;
  const assigned = await request("/api/v1/tickets/" + t1.id, "PATCH", { assignedTo: techId, status: "in_progress" }, ta);
  assert.equal(assigned.status, 200);
  assert.equal(assigned.data.data.assigned_to, techId);
  assert.equal(assigned.data.data.status, "in_progress");
  assert.equal((await request("/api/v1/tickets/" + t1.id, "PATCH", { assignedTo: b.data.user.id }, ta)).status, 400, "cannot assign to another tenant's staff");
  assert.equal((await request("/api/v1/tickets/" + t1.id, "PATCH", {}, ta)).status, 400);
  assert.equal((await request("/api/v1/tickets/" + t1.id, "PATCH", { status: "bogus" }, ta)).status, 400);
  const resolved = await request("/api/v1/tickets/" + t1.id, "PATCH", { status: "resolved" }, tt);
  assert.equal(resolved.status, 200);
  assert.ok(resolved.data.data.resolved_at);
  const list = (await request("/api/v1/tickets", "GET", undefined, ta)).data.data;
  assert.equal(list.find(x => x.id === t1.id).assigned_to_name, "Tech One");
  const hist = (await request("/api/v1/tickets/" + t1.id + "/history", "GET", undefined, ta)).data.data;
  assert.deepEqual(hist.map(h => h.action), ["created", "status_changed", "assigned", "status_changed"]);
  assert.equal((await request("/api/v1/tickets/" + t1.id + "/history", "GET", undefined, tb)).status, 404, "history is tenant-isolated");
  assert.equal((await request("/api/v1/tickets/" + t1.id, "PATCH", { status: "closed" }, tb)).status, 404);
  const unassigned = await request("/api/v1/tickets/" + t2.id, "PATCH", { assignedTo: null }, ta);
  assert.equal(unassigned.status, 200);


  // Password reset: one-time token, tenant-safe, sessions revoked
  const techUserId = techLogin.user.id;
  assert.equal((await request("/api/v1/staff/" + techUserId + "/password-reset", "POST", {}, tt)).status, 403, "technician cannot issue resets");
  assert.equal((await request("/api/v1/staff/" + techUserId + "/password-reset", "POST", {}, tb)).status, 404, "other tenant cannot reset our staff");
  const reset = await request("/api/v1/staff/" + techUserId + "/password-reset", "POST", {}, ta);
  assert.equal(reset.status, 201);
  assert.ok(reset.data.resetToken && reset.data.resetToken.length >= 40);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM password_resets WHERE token_hash=?").get(reset.data.resetToken).n, 0, "token is stored only as a hash");
  assert.equal((await request("/api/v1/auth/reset-password", "POST", { token: reset.data.resetToken, newPassword: "short" })).status, 400);
  assert.equal((await request("/api/v1/auth/reset-password", "POST", { token: "x".repeat(43), newPassword: "Brand-New-Password-1" })).status, 400);
  const done = await request("/api/v1/auth/reset-password", "POST", { token: reset.data.resetToken, newPassword: "Brand-New-Password-1" });
  assert.equal(done.status, 200);
  assert.equal((await request("/api/v1/customers", "GET", undefined, tt)).status, 401, "old sessions revoked after reset");
  assert.equal((await request("/api/v1/auth/login", "POST", { email: "tech@alpha.test", password: "Tech-Password-1234" })).status, 401, "old password rejected");
  const relogin = await request("/api/v1/auth/login", "POST", { email: "tech@alpha.test", password: "Brand-New-Password-1" });
  assert.equal(relogin.status, 200);
  tt = relogin.data.token;
  assert.equal((await request("/api/v1/auth/reset-password", "POST", { token: reset.data.resetToken, newPassword: "Another-Password-123" })).status, 400, "token is single-use");
  db.prepare("UPDATE password_resets SET expires_at='2000-01-01T00:00:00.000Z'").run();
  const reset2 = await request("/api/v1/staff/" + techUserId + "/password-reset", "POST", {}, ta);
  db.prepare("UPDATE password_resets SET expires_at='2000-01-01T00:00:00.000Z' WHERE used_at IS NULL").run();
  assert.equal((await request("/api/v1/auth/reset-password", "POST", { token: reset2.data.resetToken, newPassword: "Another-Password-123" })).status, 400, "expired token rejected");
  const ownerId = db.prepare("SELECT id FROM users WHERE email=?").get("owner@alpha.test").id;
  const admin = await request("/api/v1/staff", "POST", { fullName: "Admin One", email: "admin@alpha.test", password: "Admin-Password-1234", role: "admin" }, ta);
  const adminTok = (await request("/api/v1/auth/login", "POST", { email: "admin@alpha.test", password: "Admin-Password-1234" })).data.token;
  assert.equal((await request("/api/v1/staff/" + ownerId + "/password-reset", "POST", {}, adminTok)).status, 403, "admin cannot reset the owner");
  const dash2 = (await request("/api/v1/dashboard", "GET", undefined, ta)).data.stats;
  assert.equal(typeof dash2.connectedCustomers, "number");
  assert.equal(typeof dash2.disconnectedCustomers, "number");
  assert.ok(dash2.newRegistrations >= 1);
  // Direct DB guard: assignee tenant mismatch is rejected by trigger
  assert.throws(() => db.prepare("UPDATE support_tickets SET assigned_to=? WHERE id=?").run(b.data.user.id, t2.id), /assignee tenant mismatch/);

  // Workspace settings, branding and plan limits
  const settings = await request("/api/v1/tenant", "PATCH", { brandColor: "#0b5d2a", supportPhone: "+92 300 1234567", address: "Main Road" }, ta);
  assert.equal(settings.status, 200);
  assert.equal(settings.data.data.brand_color, "#0b5d2a");
  assert.equal(settings.data.data.plan, "pro");
  assert.equal((await request("/api/v1/tenant", "PATCH", { brandColor: "green" }, ta)).status, 400);
  assert.equal((await request("/api/v1/auth/me", "GET", undefined, tt)).data.tenant.brand_color, "#0b5d2a", "staff see tenant branding via auth/me");
  assert.equal((await request("/api/v1/tenant", "PATCH", { name: "Hack", plan: "pro" }, tt)).status, 403, "only owner edits settings");
  assert.equal((await request("/api/v1/tenant", "GET", undefined, tb)).data.data.plan, "starter", "self-registered ISPs start on starter");
  assert.equal((await request("/api/v1/tenant", "GET", undefined, tb)).data.data.brand_color, "#16a34a");
  await request("/api/v1/tenant", "PATCH", { plan: "pro", customer_limit: 100000 }, tb);
  assert.equal((await request("/api/v1/tenant", "GET", undefined, tb)).data.data.plan, "starter", "owner cannot change own plan");
  db.prepare("UPDATE tenants SET customer_limit=1 WHERE id=?").run(b.data.tenant.id);
  assert.equal((await request("/api/v1/customers", "POST", { fullName: "Over Limit" }, tb)).status, 402, "plan customer limit enforced");
  assert.equal((await request("/api/v1/customers", "POST", { fullName: "Alpha Two" }, ta)).status, 201, "other tenant unaffected");
  console.log("NEXUS tenant isolation, role and complaint workflow tests passed.");
} finally {
  server.close();
}
