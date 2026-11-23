import assert from "node:assert/strict";

const base = (process.env.NEXUS_STAGING_API_URL || "https://nexus-saas-api-staging.harissaeed030.workers.dev").replace(/\/$/, "");
const trustedOrigin = "https://nexus-isp-management.pages.dev";
const untrustedOrigin = "https://example.invalid";

async function request(path, options = {}) {
  return fetch(base + path, options);
}

// This endpoint is deliberately handled before startup migrations and only runs SELECT 1.
const healthResponse = await request("/api/health", {
  headers: { origin: trustedOrigin }
});
assert.equal(healthResponse.status, 200, "staging health status");
const health = await healthResponse.json();
assert.equal(health.status, "healthy", "staging Worker health");
assert.equal(health.database, "ok", "staging D1 SELECT 1");
assert.equal(healthResponse.headers.get("access-control-allow-origin"), trustedOrigin);
assert.equal(healthResponse.headers.get("cache-control"), "no-store");
assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");
assert.equal(healthResponse.headers.get("x-frame-options"), "DENY");
assert.equal(healthResponse.headers.get("referrer-policy"), "no-referrer");
assert.match(healthResponse.headers.get("strict-transport-security") || "", /max-age=31536000/);
console.log("PASS: health endpoint, read-only D1 check, trusted GET CORS, and security headers");

const trustedPreflight = await request("/api/auth/login", {
  method: "OPTIONS",
  headers: {
    origin: trustedOrigin,
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type,authorization"
  }
});
assert.equal(trustedPreflight.status, 204, "trusted CORS preflight");
assert.equal(trustedPreflight.headers.get("access-control-allow-origin"), trustedOrigin);
assert.match(trustedPreflight.headers.get("access-control-allow-methods") || "", /POST/);
assert.match(trustedPreflight.headers.get("access-control-allow-headers") || "", /Authorization/i);
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

console.log("PASS: read-only probes did not attempt authentication or mutate tenant data");
console.log("Read-only staging smoke checks passed. No tenant, customer, invoice, payment, or ticket records were created.");
