import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_ADAPTER_CONTRACT_VERSION,
  validateAdapterRequest,
  assertTenantOwnership,
  assertReadOnlyCapability,
  createReadOnlyPlan,
  redactNetworkSecrets
} from "../src/services/network-adapter-contract.js";

const request = {
  contractVersion: NETWORK_ADAPTER_CONTRACT_VERSION,
  organizationId: "org-a",
  deviceId: "router-a",
  requestId: "req-001",
  requestedBy: "user-a",
  operation: "mikrotik.pppoe.sessions.list",
  capability: "mikrotik.pppoe.sessions.read"
};

test("validates and normalizes the versioned request envelope", () => {
  assert.equal(validateAdapterRequest(request).organizationId, "org-a");
  assert.throws(() => validateAdapterRequest({ ...request, contractVersion: "0.9.0" }), /version/i);
  assert.throws(() => validateAdapterRequest({ ...request, deviceId: " " }), /deviceId/);
});

test("tenant ownership mismatch is rejected", () => {
  assert.equal(assertTenantOwnership("org-a", "org-a"), true);
  assert.throws(() => assertTenantOwnership("org-b", "org-a"), error =>
    error.code === "NETWORK_TENANT_MISMATCH");
});

test("only explicitly enabled read capabilities are accepted", () => {
  assert.equal(assertReadOnlyCapability({ [request.capability]: true }, request.capability), true);
  assert.throws(() => assertReadOnlyCapability({}, request.capability), error =>
    error.code === "NETWORK_CAPABILITY_UNAVAILABLE");
  assert.throws(() => assertReadOnlyCapability({ "mikrotik.pppoe.secret.write": true },
    "mikrotik.pppoe.secret.write"), error => error.code === "NETWORK_CAPABILITY_UNAVAILABLE");
});

test("read-only plan is metadata only and cannot execute a device command", () => {
  const plan = createReadOnlyPlan(request, { [request.capability]: true });
  assert.equal(plan.status, "planned");
  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.mode, "read-only");
  assert.equal(Object.hasOwn(plan, "command"), false);
  assert.equal(Object.hasOwn(plan, "parameters"), false);
});

test("dry-run refuses a write capability", () => {
  assert.throws(() => createReadOnlyPlan({
    ...request,
    capability: "mikrotik.pppoe.secret.write"
  }, { "mikrotik.pppoe.secret.write": true }), error =>
    error.code === "NETWORK_CAPABILITY_UNAVAILABLE");
});

test("secret redaction recursively masks credential-like fields", () => {
  const safe = redactNetworkSecrets({
    username: "operator",
    password: "do-not-log",
    nested: { authorization: "Bearer abc", model: "RB750Gr3" },
    community: "private"
  });
  assert.equal(safe.password, "[REDACTED]");
  assert.equal(safe.nested.authorization, "[REDACTED]");
  assert.equal(safe.nested.model, "RB750Gr3");
  assert.equal(safe.community, "[REDACTED]");
});
