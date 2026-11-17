import test from "node:test";
import assert from "node:assert/strict";
import {
  requiresNetworkWriteApproval,
  isNetworkWriteApproved,
  networkWriteGuard
} from "../src/lib/network-write-guard.js";

test("protects MikroTik PPPoE create, update, suspend and restore routes", () => {
  assert.equal(requiresNetworkWriteApproval("POST", "/api/v1/routers/r1/pppoe/secrets"), true);
  assert.equal(requiresNetworkWriteApproval("PATCH", "/api/v1/routers/r1/pppoe/secrets/user1"), true);
  assert.equal(requiresNetworkWriteApproval("POST", "/api/v1/routers/r1/pppoe/secrets/user1/suspend"), true);
  assert.equal(requiresNetworkWriteApproval("POST", "/api/v1/routers/r1/pppoe/secrets/user1/restore"), true);
});

test("protects TR-069 connection request, reboot and Wi-Fi writes", () => {
  for (const action of ["diagnostics", "reboot", "wifi"]) {
    assert.equal(requiresNetworkWriteApproval("POST", `/api/v1/tr069/devices/cpe1/${action}`), true);
  }
});

test("does not block inventory, read or unrelated business routes", () => {
  assert.equal(requiresNetworkWriteApproval("GET", "/api/v1/routers/r1/pppoe/active"), false);
  assert.equal(requiresNetworkWriteApproval("GET", "/api/v1/tr069/devices"), false);
  assert.equal(requiresNetworkWriteApproval("POST", "/api/v1/olts"), false);
  assert.equal(requiresNetworkWriteApproval("POST", "/api/v1/payments"), false);
});

test("requires feature flag, long token and exact approval token", () => {
  const token = "nexus-network-approval-token-32-bytes-minimum";
  assert.equal(isNetworkWriteApproved({ enabled: false, approvalToken: token, suppliedToken: token }), false);
  assert.equal(isNetworkWriteApproved({ enabled: true, approvalToken: "short", suppliedToken: "short" }), false);
  assert.equal(isNetworkWriteApproved({ enabled: true, approvalToken: token, suppliedToken: "wrong" }), false);
  assert.equal(isNetworkWriteApproved({ enabled: true, approvalToken: token, suppliedToken: token }), true);
});

test("middleware returns locked response by default and passes non-write requests", () => {
  const previousEnabled = process.env.NEXUS_NETWORK_WRITE_ENABLED;
  const previousToken = process.env.NEXUS_NETWORK_WRITE_APPROVAL_TOKEN;
  delete process.env.NEXUS_NETWORK_WRITE_ENABLED;
  delete process.env.NEXUS_NETWORK_WRITE_APPROVAL_TOKEN;
  let status, payload, continued = false;
  const response = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; }
  };
  networkWriteGuard({
    method: "POST",
    path: "/api/v1/routers/r1/pppoe/secrets",
    get: () => ""
  }, response, () => { continued = true; });
  assert.equal(status, 423);
  assert.equal(payload.success, false);
  assert.equal(continued, false);

  networkWriteGuard({
    method: "GET",
    path: "/api/v1/routers/r1/pppoe/active",
    get: () => ""
  }, response, () => { continued = true; });
  assert.equal(continued, true);

  if (previousEnabled === undefined) delete process.env.NEXUS_NETWORK_WRITE_ENABLED;
  else process.env.NEXUS_NETWORK_WRITE_ENABLED = previousEnabled;
  if (previousToken === undefined) delete process.env.NEXUS_NETWORK_WRITE_APPROVAL_TOKEN;
  else process.env.NEXUS_NETWORK_WRITE_APPROVAL_TOKEN = previousToken;
});
