import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";

const dir = mkdtempSync(join(tmpdir(), "nexus-customer-subscriptions-"));
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
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
};

try {
  const setup = await request("/api/v1/setup", "POST", {
    companyName: "Customer Lifecycle Test ISP",
    fullName: "Test Owner",
    email: "owner@customer-lifecycle.test",
    password: "Strong-Test-Password-123"
  });
  assert.equal(setup.status, 201);
  const token = setup.data.token;

  const create = await request("/api/v1/customers", "POST", {
    fullName: "Synthetic Subscriber",
    phone: "03000000000",
    email: "subscriber@example.test",
    address: "Unit 8 Latifabad",
    serviceAddress: "House 12, Unit 8, Latifabad",
    coverageArea: "Latifabad Unit 8",
    installationDate: "2026-11-01",
    status: "active",
    connectionStatus: "pending"
  }, token);
  assert.equal(create.status, 201);
  const customer = create.data.data;
  assert.match(customer.account_number, /^NXS-[0-9]{7}$/);
  assert.equal(customer.service_address, "House 12, Unit 8, Latifabad");
  assert.equal(customer.coverage_area, "Latifabad Unit 8");

  const second = await request("/api/v1/customers", "POST", { fullName: "Second Subscriber" }, token);
  assert.equal(second.status, 201);
  assert.notEqual(second.data.data.account_number, customer.account_number);

  const invalidDate = await request("/api/v1/customers", "POST", {
    fullName: "Invalid Date", installationDate: "01-11-2026"
  }, token);
  assert.equal(invalidDate.status, 400);
  const invalidFilter = await request("/api/v1/customers?connectionStatus=unknown", "GET", undefined, token);
  assert.equal(invalidFilter.status, 400);

  const update = await request("/api/v1/customers/" + customer.id, "PATCH", {
    fullName: "Synthetic Subscriber Updated",
    connectionStatus: "active",
    serviceAddress: "Updated service address",
    coverageArea: "Latifabad"
  }, token);
  assert.equal(update.status, 200);
  assert.equal(update.data.data.full_name, "Synthetic Subscriber Updated");

  const search = await request("/api/v1/customers?q=Latifabad&page=1&pageSize=1", "GET", undefined, token);
  assert.equal(search.status, 200);
  assert.equal(search.data.pagination.total, 1);
  assert.equal(search.data.pagination.pageSize, 1);
  const filtered = await request("/api/v1/customers?connectionStatus=active", "GET", undefined, token);
  assert.ok(filtered.data.data.some(x => x.id === customer.id));

  const pack = await request("/api/v1/packages", "POST", {
    name: "Lifecycle 10 Mbps", speedDownMbps: 10, speedUpMbps: 10, monthlyPricePkr: 1500
  }, token);
  assert.equal(pack.status, 201);
  const alternatePack = await request("/api/v1/packages", "POST", {
    name: "Lifecycle 20 Mbps", speedDownMbps: 20, speedUpMbps: 20, monthlyPricePkr: 2200
  }, token);
  assert.equal(alternatePack.status, 201);

  const sub = await request("/api/v1/subscriptions", "POST", {
    customerId: customer.id, packageId: pack.data.data.id,
    status: "active", startedAt: "2026-11-01", expiresAt: "2026-12-01"
  }, token);
  assert.equal(sub.status, 201);
  const changed = await request("/api/v1/subscriptions/" + sub.data.data.id, "PATCH", {
    packageId: alternatePack.data.data.id, status: "suspended", expiresAt: "2026-12-15"
  }, token);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.data.package_id, alternatePack.data.data.id);
  assert.equal(changed.data.data.status, "suspended");

  const resumed = await request("/api/v1/subscriptions/" + sub.data.data.id, "PATCH", {
    status: "active"
  }, token);
  assert.equal(resumed.status, 200);
  const renewed = await request("/api/v1/subscriptions/" + sub.data.data.id + "/renew", "POST", {
    days: 30
  }, token);
  assert.equal(renewed.status, 200);
  assert.equal(renewed.data.data.status, "active");
  assert.ok(renewed.data.data.expires_at > "2026-12-15");

  const profile = await request("/api/v1/customers/" + customer.id + "/profile", "GET", undefined, token);
  assert.equal(profile.status, 200);
  assert.equal(profile.data.data.subscriptions.length, 1);
  assert.ok(profile.data.data.connectionHistory.length >= 2);
  assert.ok(profile.data.data.subscriptionHistory.some(x => x.event_type === "package_changed"));
  assert.ok(profile.data.data.subscriptionHistory.some(x => x.event_type === "suspended"));
  assert.ok(profile.data.data.subscriptionHistory.some(x => x.event_type === "renewed"));

  const history = await request("/api/v1/customers/" + customer.id + "/history", "GET", undefined, token);
  assert.equal(history.status, 200);
  assert.ok(history.data.data.length >= 5);
  const conflictDelete = await request("/api/v1/customers/" + customer.id, "DELETE", undefined, token);
  assert.equal(conflictDelete.status, 409);
  const deleteUnlinked = await request("/api/v1/customers/" + second.data.data.id, "DELETE", undefined, token);
  assert.equal(deleteUnlinked.status, 200);
  const missing = await request("/api/v1/customers/" + second.data.data.id, "GET", undefined, token);
  assert.equal(missing.status, 404);

  console.log("NEXUS customer/subscription tests passed: account numbering, validation, CRUD, search, pagination, service details, package changes, renewal, suspension, histories and safe deletion.");
} finally {
  await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
