import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApiMethod, normalizeApiPath, validateAcsUrl, redactTr069Tree, encryptAcsSecret, decryptAcsSecret, tr069Status, buildGenieAcsTask, encryptRouterSecret, decryptRouterSecret, hashPw, verifyPw, corsHeaders } from "../src/production-worker.js";

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
  assert.equal(await decryptAcsSecret(encrypted, env), "genieacs-private-password");
  await assert.rejects(() => decryptAcsSecret(encrypted, { JWT_SECRET: "different-secret" }));

  const routerEnv = { JWT_SECRET: "test-only-worker-secret-for-router-encryption" };
  const routerEncrypted = await encryptRouterSecret("router-private-password", routerEnv);
  assert.notEqual(routerEncrypted, "router-private-password");
  assert.match(routerEncrypted, /^enc:v1:/);
  assert.equal(await decryptRouterSecret(routerEncrypted, routerEnv), "router-private-password");
  await assert.rejects(() => decryptRouterSecret(routerEncrypted, { JWT_SECRET: "different-router-secret" }));
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

test("keeps live RouterOS operations explicitly disabled until a connector is deployed", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/production-worker.js", import.meta.url), "utf8");
  assert.match(source, /Hosted D1 currently supports router inventory and encrypted credential storage only\. Live RouterOS\/PPPoE operations require the separate network connector\./);
  assert.match(source, /liveSupported:false/);
});

test("documents the required outbound-only, read-only MikroTik connector safety boundary", async () => {
  const { readFile } = await import("node:fs/promises");
  const doc = await readFile(new URL("../../docs/MIKROTIK-ROUTEROS-CONNECTOR.md", import.meta.url), "utf8");
  assert.match(doc, /outbound HTTPS/i);
  assert.match(doc, /read-only commands only/i);
  assert.match(doc, /Do not expose RouterOS API/i);
  assert.match(doc, /Do not deploy an untested connector/i);
});


test("password verification rejects unsalted/plaintext credentials and uses fixed-length comparison", async () => {
  const credentials = await hashPw("Nexus-Test-Password-2026!");
  assert.match(credentials.hash, /^[a-f0-9]{64}$/);
  assert.match(credentials.salt, /^[a-f0-9]{32}$/);
  assert.equal(await verifyPw("Nexus-Test-Password-2026!", credentials.hash, credentials.salt), true);
  assert.equal(await verifyPw("wrong-password", credentials.hash, credentials.salt), false);
  assert.equal(await verifyPw("plaintext", "plaintext", null), false);
  assert.equal(await verifyPw("Nexus-Test-Password-2026!", credentials.hash, null), false);
  assert.equal(await verifyPw("Nexus-Test-Password-2026!", credentials.hash, "bad-salt"), false);

  const { readFile } = await import("node:fs/promises");
  const indexSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const productionSource = await readFile(new URL("../src/production-worker.js", import.meta.url), "utf8");
  for (const source of [indexSource, productionSource]) {
    assert.doesNotMatch(source, /if\(!salt\)return pw===h/);
    assert.match(source, /safeHashEqual\(hash,h\.toLowerCase\(\)\)/);
  }
});


test("allows the exact Android WebView localhost origin without allowing arbitrary origins", () => {
  const androidRequest = new Request("https://api.example.test/api/v1/auth/login", {
    headers: { Origin: "https://localhost" }
  });
  const allowed = corsHeaders(androidRequest, {});
  assert.equal(allowed.get("Access-Control-Allow-Origin"), "https://localhost");

  const untrustedRequest = new Request("https://api.example.test/api/v1/auth/login", {
    headers: { Origin: "https://attacker.example" }
  });
  const rejected = corsHeaders(untrustedRequest, {});
  assert.equal(rejected.get("Access-Control-Allow-Origin"), null);

});


test("staging Worker mirrors production modules while keeping E2E cleanup staging-only", async () => {
  const { readFile } = await import("node:fs/promises");
  const stagingSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const productionSource = await readFile(new URL("../src/production-worker.js", import.meta.url), "utf8");

  for (const feature of ["payment_promises", "credential_password_cipher", "tr069_devices", "refunds"]) {
    assert.ok(stagingSource.includes(feature), `staging Worker missing production feature: ${feature}`);
    assert.ok(productionSource.includes(feature), `production Worker missing feature: ${feature}`);
  }
  assert.ok(stagingSource.includes("/api/e2e/tenant"));
  assert.ok(stagingSource.includes("nexus-saas-api-staging.harissaeed030.workers.dev"));
  assert.ok(!productionSource.includes("/api/e2e/tenant"));
});


test("password recovery routes are wired in staging and production and exposed by the login UI", async () => {
  const { readFile } = await import("node:fs/promises");
  const staging = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const production = await readFile(new URL("../src/production-worker.js", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../../assets/js/app.js", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/password-reset.js", import.meta.url), "utf8");
  for (const source of [staging, production]) {
    assert.match(source, /from "\.\/password-reset\.js"/);
    assert.match(source, /path==='\/api\/auth\/password-reset\/request'&&m==='POST'/);
    assert.match(source, /path==='\/api\/auth\/reset-password'&&m==='POST'/);
  }
  assert.equal(normalizeApiPath("/api/v1/auth/password-reset/request"), "/api/auth/password-reset/request");
  assert.equal(normalizeApiPath("/api/v1/auth/reset-password"), "/api/auth/reset-password");
  assert.match(dashboard, /Forgot password\?/);
  assert.match(dashboard, /call\("\/api\/v1\/auth\/password-reset\/request"/);
  assert.match(dashboard, /call\("\/api\/v1\/auth\/reset-password"/);
  assert.match(dashboard, /new URLSearchParams\(location\.hash\.slice\(1\)\)\.has\("reset"\)/);
  assert.match(service, /julianday\(expires_at\)>julianday\('now'\)/);
});
