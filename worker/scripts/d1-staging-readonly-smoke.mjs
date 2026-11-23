import assert from "node:assert/strict";

const base = (process.env.NEXUS_STAGING_API_URL || "https://nexus-saas-api-staging.harissaeed030.workers.dev").replace(/\/$/, "");
const trustedOrigin = "https://nexus-isp-management.pages.dev";
const untrustedOrigin = "https://example.invalid";

async function request(path, options = {}) {
  return fetch(base + path, options);
}

const healthResponse = await request("/api/health");
assert.equal(healthResponse.status, 200, "staging health status");
const health = await healthResponse.json();
assert.equal(health.status, "healthy", "staging Worker and D1 health");
assert.equal(health.database, "ok", "staging D1 SELECT 1");
console.log("PASS: health endpoint and D1 read");

const trustedPreflight = await request("/api/auth/login", {
  method: "OPTIONS",
  headers: {
    origin: trustedOrigin,
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type"
  }
});
assert.equal(trustedPreflight.status, 204, "trusted CORS preflight");
assert.equal(trustedPreflight.headers.get("access-control-allow-origin"), trustedOrigin);
console.log("PASS: NEXUS Pages CORS preflight");

const untrustedPreflight = await request("/api/auth/login", {
  method: "OPTIONS",
  headers: {
    origin: untrustedOrigin,
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type"
  }
});
assert.equal(untrustedPreflight.status, 204, "untrusted preflight is answered without granting access");
assert.notEqual(untrustedPreflight.headers.get("access-control-allow-origin"), untrustedOrigin);
console.log("PASS: untrusted origin is not reflected");

for (const path of ["/api/auth/me", "/api/customers", "/api/customer-portal/me"]) {
  const response = await request(path);
  assert.equal(response.status, 401, `unauthenticated request rejected: ${path}`);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
}
console.log("PASS: protected dashboard and customer portal routes reject anonymous access");

console.log("Read-only staging smoke checks passed. No tenant, customer, invoice, payment, or ticket records were created.");
