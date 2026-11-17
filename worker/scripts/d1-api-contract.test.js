import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeApiMethod } from "../src/d1-api-worker.js";

const source = await readFile(new URL("../src/d1-api-worker.js", import.meta.url), "utf8");
const config = await readFile(new URL("../wrangler.api.toml", import.meta.url), "utf8");

test("D1 API Worker includes authenticated organization registration and login", () => {
  assert.match(source, /\/api\/auth\/register/);
  assert.match(source, /\/api\/auth\/login/);
  assert.match(source, /verifyJWT/);
  assert.match(source, /tokenVersion/);
});

test("D1 API Worker includes core ISP billing and customer modules", () => {
  for (const route of ["/api/customers", "/api/packages", "/api/subscriptions", "/api/invoices", "/api/payments", "/api/billing/generate", "/api/refunds", "/api/complaints"]) {
    assert.ok(source.includes(route), `Missing API route family: ${route}`);
  }
});

test("D1 API Worker includes network inventory and staff permission modules", () => {
  for (const route of ["/api/staff", "/api/pppoe", "/api/onus", "/api/network/devices", "/api/audit-logs", "/api/notifications"]) {
    assert.ok(source.includes(route), `Missing API route family: ${route}`);
  }
  assert.match(source, /roleAllowedWithOverrides/);
});

test("candidate config is isolated from production D1", () => {
  assert.match(config, /name = "nexus-saas-api-staging"/);
  assert.match(config, /database_name = "nexus-saas-staging-db"/);
  assert.match(config, /194f62e2-2766-48ab-be17-81248610c0cd/);
  assert.doesNotMatch(config, /ce88098b-bff4-4d06-a0df-7bf29622a085/);
});

test("D1 API accepts dashboard PATCH updates through the existing PUT handlers", () => {
  assert.equal(normalizeApiMethod("PATCH"), "PUT");
  assert.equal(normalizeApiMethod("PUT"), "PUT");
  assert.equal(normalizeApiMethod("GET"), "GET");
  assert.match(source, /new Request\(request,\{method:'PUT'\}\)/);
});
