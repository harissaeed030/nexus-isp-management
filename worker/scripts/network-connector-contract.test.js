import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_READ_CAPABILITIES,
  validateNetworkConnectorName,
  isNetworkConnectorToken,
  validateNetworkJobRequest,
  redactNetworkResult
} from "../src/network-connector-contract.js";

test("only supported read-only MikroTik capabilities are accepted", () => {
  assert.equal(NETWORK_READ_CAPABILITIES.has("mikrotik.identity.read"), true);
  assert.equal(NETWORK_READ_CAPABILITIES.has("mikrotik.pppoe.secret.write"), false);
});

test("connector names and one-time tokens are validated", () => {
  assert.equal(validateNetworkConnectorName("ISP LAN Connector"), true);
  assert.equal(validateNetworkConnectorName("x"), false);
  assert.equal(isNetworkConnectorToken("nxc_" + "A".repeat(43)), true);
  assert.equal(isNetworkConnectorToken("nxc_short"), false);
});

test("network job request requires tenant-bound IDs, read capability and idempotency key", () => {
  assert.deepEqual(validateNetworkJobRequest({
    connector_id: "connector-1",
    device_id: "router-1",
    capability: "mikrotik.pppoe.sessions.read",
    idempotency_key: "req-00000001"
  }), {
    connectorId: "connector-1",
    deviceId: "router-1",
    capability: "mikrotik.pppoe.sessions.read",
    idempotencyKey: "req-00000001"
  });
  assert.throws(() => validateNetworkJobRequest({
    connector_id: "connector-1",
    device_id: "router-1",
    capability: "mikrotik.pppoe.secret.write",
    idempotency_key: "req-00000001"
  }), /read capability/i);
});

test("connector result redaction removes secrets and bounds nested payloads", () => {
  const safe = redactNetworkResult({
    model: "RB750Gr3",
    password: "secret",
    nested: { authorization: "Bearer secret", rxPower: -18.2 },
    list: Array.from({ length: 120 }, (_, i) => i)
  });
  assert.equal(safe.password, "[REDACTED]");
  assert.equal(safe.nested.authorization, "[REDACTED]");
  assert.equal(safe.nested.rxPower, -18.2);
  assert.equal(safe.list.length, 100);
});
