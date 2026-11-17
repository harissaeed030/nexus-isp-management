import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeApiMethod, mapTicketRow, normalizeTicketPayload, mapCustomerRow, normalizeCustomerPayload } from "../src/d1-api-worker.js";

const source = await readFile(new URL("../src/d1-api-worker.js", import.meta.url), "utf8");
const config = await readFile(new URL("../wrangler.api.toml", import.meta.url), "utf8");
const customerMigration = await readFile(new URL("../../cloudflare/d1/migrations/0012_customer_workspace_compatibility.sql", import.meta.url), "utf8");

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

test("dashboard compatibility routes and ticket adapter are present", () => {
  assert.match(source, /path==='\/api\/dashboard'/);
  assert.match(source, /path==='\/api\/reports\/summary'/);
  assert.match(source, /if\(path==='\/api\/tickets'\)path='\/api\/complaints'/);
  assert.deepEqual(mapTicketRow({first_name:"Ali",last_name:"Khan",priority:null}), {first_name:"Ali",last_name:"Khan",priority:"normal",customer_name:"Ali Khan",customer_id:null});
  assert.equal(normalizeTicketPayload({customerId:"c1",subject:"Line down"}).customer_id,"c1");
});


test("customer DTO maps legacy D1 rows to the dashboard contract", () => {
  assert.deepEqual(mapCustomerRow({
    id: "c1", first_name: "Haris", last_name: "Qureshi", customer_code: "CUS-123",
    installation_address: "Unit 8", account_status: "blocked", connection_status: "suspended"
  }), {
    id: "c1", first_name: "Haris", last_name: "Qureshi", customer_code: "CUS-123",
    installation_address: "Unit 8", account_status: "blocked", connection_status: "suspended",
    full_name: "Haris Qureshi", account_number: "CUS-123", service_address: "Unit 8",
    coverage_area: "", status: "blocked"
  });
});

test("customer request adapter maps dashboard camelCase fields without conflating account and connection status", () => {
  assert.deepEqual(normalizeCustomerPayload({
    fullName: "Haris Qureshi", serviceAddress: "Unit 8", coverageArea: "Latifabad",
    connectionStatus: "active", status: "blocked", installationDate: "2026-11-17"
  }), {
    fullName: "Haris Qureshi", serviceAddress: "Unit 8", coverageArea: "Latifabad",
    connectionStatus: "active", status: "blocked", installationDate: "2026-11-17",
    first_name: "Haris", last_name: "Qureshi", service_address: "Unit 8",
    coverage_area: "Latifabad", connection_status: "active",
    account_status: "blocked", installation_date: "2026-11-17"
  });
});

test("customer CRUD supports dashboard pagination, filters, profile route and linked-record delete protection", () => {
  assert.match(source, /pageSize/);
  assert.match(source, /coverageArea/);
  assert.match(source, /connectionStatus/);
  assert.match(source, /getCustomerProfile/);
  assert.match(source, /CUSTOMER_HAS_LINKED_RECORDS/);
  assert.match(source, /account_status/);
});

test("customer workspace migration is additive and tenant-scoped", () => {
  for (const field of ["account_number", "service_address", "coverage_area", "connection_status", "account_status"]) {
    assert.match(customerMigration, new RegExp("ADD COLUMN " + field));
  }
  assert.match(customerMigration, /organization_id, customer_id, created_at/);
  assert.match(customerMigration, /customer connection history tenant mismatch/);
  assert.match(customerMigration, /subscription history tenant mismatch/);
});
