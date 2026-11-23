import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApiMethod, normalizeApiPath } from "../src/production-worker.js";

test("normalizes versioned API paths to D1 routes", () => {
  assert.equal(normalizeApiPath("/api/v1/auth/login"), "/api/auth/login");
  assert.equal(normalizeApiPath("/api/v1/setup"), "/api/auth/register");
  assert.equal(normalizeApiPath("/api/v1/dashboard"), "/api/dashboard/stats");
  assert.equal(normalizeApiPath("/api/v1/reports/summary"), "/api/reports/summary");
});

test("maps frontend tickets and router collections to D1 resources", () => {
  assert.equal(normalizeApiPath("/api/v1/tickets"), "/api/complaints");
  assert.equal(normalizeApiPath("/api/v1/tickets/abc"), "/api/complaints/abc");
  assert.equal(normalizeApiPath("/api/v1/routers"), "/api/network/devices");
  assert.equal(normalizeApiPath("/api/v1/routers/router-1"), "/api/network/devices/router-1");
});

test("normalizes supported PATCH updates to the D1 worker PUT contract", () => {
  assert.equal(normalizeApiMethod("/api/customers/customer-1", "PATCH"), "PUT");
  assert.equal(normalizeApiMethod("/api/complaints/ticket-1", "PATCH"), "PUT");
  assert.equal(normalizeApiMethod("/api/customers", "PATCH"), "PATCH");
  assert.equal(normalizeApiMethod("/api/customers/customer-1", "GET"), "GET");
});
