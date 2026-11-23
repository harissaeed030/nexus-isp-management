import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApiMethod, normalizeApiPath, validateAcsUrl, redactTr069Tree, encryptAcsSecret, decryptAcsSecret, tr069Status, buildGenieAcsTask, encryptRouterSecret, decryptRouterSecret } from "../src/production-worker.js";

test("normalizes versioned API paths to D1 routes", () => {
  assert.equal(normalizeApiPath("/api/v1/auth/login"), "/api/auth/login");
  assert.equal(normalizeApiPath("/api/v1/setup"), "/api/auth/register");
  assert.equal(normalizeApiPath("/api/v1/dashboard"), "/api/dashboard/stats");
  assert.equal(normalizeApiPath("/api/v1/reports/summary"), "/api/reports/summary");
  assert.equal(normalizeApiPath("/api/v1/operations/payment-promises"), "/api/operations/payment-promises");
  assert.equal(normalizeApiPath("/api/v1/financial/aging"), "/api/financial/aging");
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
  assert.equal(normalizeApiMethod("/api/operations/payment-promises/promise-1", "PATCH"), "PUT");
  assert.equal(normalizeApiMethod("/api/packages/package-1", "PATCH"), "PUT");
  assert.equal(normalizeApiMethod("/api/subscriptions/subscription-1", "PATCH"), "PUT");
  assert.equal(normalizeApiMethod("/api/network/devices/router-1", "PATCH"), "PUT");
  assert.equal(normalizeApiMethod("/api/customers", "PATCH"), "PATCH");
  assert.equal(normalizeApiMethod("/api/customers/customer-1", "GET"), "GET");
});

test("normalizes TR-069 hosted API endpoints", () => {
  assert.equal(normalizeApiPath("/api/v1/acs/connections"), "/api/acs/connections");
  assert.equal(normalizeApiPath("/api/v1/tr069/devices"), "/api/tr069/devices");
  assert.equal(normalizeApiPath("/api/v1/tr069/audit-logs"), "/api/tr069/audit-logs");
  assert.equal(normalizeApiMethod("/api/customers/customer-1/profile", "GET"), "GET");
});

test("only accepts public HTTPS ACS endpoints", () => {
  assert.equal(validateAcsUrl("http://acs.example.com:7557"), null);
  assert.equal(validateAcsUrl("https://localhost:7557"), null);
  assert.equal(validateAcsUrl("https://127.0.0.1:7557"), null);
  assert.equal(validateAcsUrl("https://acs.example.com:7557").protocol, "https:");
  assert.equal(validateAcsUrl("https://user:pass@acs.example.com"), null);
});

test("redacts credentials from TR-069 parameter snapshots", () => {
  const tree = redactTr069Tree({
    Device: {
      WiFi: {
        SSID: { _value: "Vancom-WiFi", _type: "xsd:string" },
        KeyPassphrase: { _value: "secret-value", _type: "xsd:string" }
      },
      ManagementServer: { Username: { _value: "acs-user" }, Password: { _value: "secret" } }
    }
  });
  assert.equal(tree.Device.WiFi.SSID._value, "Vancom-WiFi");
  assert.equal("KeyPassphrase" in tree.Device.WiFi, false);
  assert.equal("Password" in tree.Device.ManagementServer, false);
});

test("ACS credentials are encrypted at rest and decrypt only with the Worker secret", async () => {
  const env = { JWT_SECRET: "test-only-worker-secret-for-acs-encryption" };
  const encrypted = await encryptAcsSecret("genieacs-private-password", env);
  assert.notEqual(encrypted, "genieacs-private-password");
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(await decryptRouterSecret(encrypted, { JWT_SECRET: "test-only-worker-secret-for-router-encryption" }), "router-private-password");
  await assert.rejects(() => decryptRouterSecret(encrypted, { JWT_SECRET: "different-router-secret" }));
  assert.equal(await decryptAcsSecret(encrypted, env), "genieacs-private-password");
  await assert.rejects(() => decryptAcsSecret(encrypted, { JWT_SECRET: "different-secret" }));
});

test("TR-069 online state is based on the ten-minute last-inform window", () => {
  assert.equal(tr069Status(new Date().toISOString()), "online");
  assert.equal(tr069Status(new Date(Date.now() - 11 * 60 * 1000).toISOString()), "offline");
  assert.equal(tr069Status(null), "unknown");
});

test("builds GenieACS NBI task payloads with documented fields", () => {
  assert.deepEqual(buildGenieAcsTask("refreshObject", { objectName: "InternetGatewayDevice.WANDevice" }), {
    name: "refreshObject",
    objectName: "InternetGatewayDevice.WANDevice"
  });
  assert.deepEqual(buildGenieAcsTask("setParameterValues", {
    parameterValues: [["Device.WiFi.SSID.1.SSID", "Vancom", "xsd:string"]]
  }), {
    name: "setParameterValues",
    parameterValues: [["Device.WiFi.SSID.1.SSID", "Vancom", "xsd:string"]]
  });
});

test("router credentials are encrypted and never stored as plain text", async () => {
  const encrypted = await encryptRouterSecret("router-private-password", {
    JWT_SECRET: "test-only-worker-secret-for-router-encryption"
  });
  assert.notEqual(encrypted, "router-private-password");
  assert.match(encrypted, /^enc:v1:/);
});
