import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const production = readFileSync(new URL("../src/production-worker.js", import.meta.url), "utf8");
const staging = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const productionConfig = readFileSync(new URL("../wrangler.production.toml", import.meta.url), "utf8");

for (const route of [
  "/api/portal/auth/login",
  "/api/portal/me",
  "/api/portal/dashboard",
  "/api/portal/invoices",
  "/api/portal/payments",
  "/api/portal/subscriptions",
  "/api/portal/tickets",
]) {
  assert.ok(production.includes(route), "Production Worker missing route " + route);
}
assert.ok(production.includes("async function portalLogin"), "Production portal login implementation missing");
assert.ok(production.includes("async function handlePortalApi"), "Production portal authorization implementation missing");
assert.ok(production.includes("const SEC_HDRS"), "Production security headers missing");
assert.ok(production.includes("function withCors"), "Production CORS wrapper missing");
assert.ok(!production.includes("/api/e2e/tenant"), "Staging-only destructive cleanup route must not ship to production");
assert.ok(staging.includes("/api/e2e/tenant"), "Staging cleanup route must remain available for staging E2E");
assert.match(productionConfig, /name = "nexus-saas-api"/);
assert.match(productionConfig, /database_id = "ce88098b-bff4-4d06-a0df-7bf29622a085"/);
console.log("Production Worker bundle: portal routes, security headers, production D1 binding and staging-cleanup exclusion verified.");
