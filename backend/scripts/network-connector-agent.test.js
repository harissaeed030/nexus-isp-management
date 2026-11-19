import test from "node:test";
import assert from "node:assert/strict";
process.env.ROUTER_CREDENTIAL_KEY = "11".repeat(32);
const { credentialCrypto } = await import("../src/routes/mikrotik.routes.js");
const { NetworkConnectorAgent } = await import("../src/services/network-connector-agent.js");
const encryptedUsername = credentialCrypto.encrypt("operator");
const encryptedPassword = credentialCrypto.encrypt("router-password");

const token = "nxc_" + "A".repeat(43);
const base = {
  apiBaseUrl: "https://nexus-saas-api-staging.workers.dev",
  token,
  deviceMap: { "hosted-router-1": "local-router-1" },
  loadRouter: async id => id === "local-router-1" ? {
    id, host: "192.0.2.1", api_port: 8729,
    credential_username: encryptedUsername,
    credential_password: encryptedPassword
  } : null
};

test("requires HTTPS Worker endpoint and valid connector token", () => {
  assert.throws(() => new NetworkConnectorAgent({ ...base, apiBaseUrl: "http://example.com" }), /HTTPS/);
  assert.throws(() => new NetworkConnectorAgent({ ...base, token: "bad" }), /token/i);
});

test("read-only job executes only through injected API and reports completion", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return { ok: true, status: 200, json: async () => ({ success: true }) };
    return { ok: true, status: 200, json: async () => ({ job: {
      id: "job-1", device_id: "hosted-router-1",
      capability: "mikrotik.pppoe.sessions.read"
    } }) };
  };
  const apiCalls = [];
  const agent = new NetworkConnectorAgent({
    ...base,
    fetchImpl,
    createApi: config => ({
      async connect() { apiCalls.push(["connect", config.port, config.tlsOptions.rejectUnauthorized]); },
      async command(path, params) { apiCalls.push(["command", path, params]); return [{ name: "cust-1" }]; },
      close() { apiCalls.push(["close"]); }
    })
  });
  assert.equal(await agent.pollOnce(), true);
  assert.equal(apiCalls[0][0], "connect");
  assert.equal(apiCalls[1][1], "/ppp/active/print");
  assert.equal(apiCalls[2][0], "close");
  assert.equal(calls[1].options.method, "POST");
  assert.match(calls[1].options.body, /"completed"/);
  assert.match(calls[1].options.headers.Authorization, /^Connector nxc_/);
});

test("never connects to router for unsupported capability or missing mapping", async () => {
  let apiCreated = false, reportBody = "";
  const agent = new NetworkConnectorAgent({
    ...base,
    fetchImpl: async (_url, options) => options.method === "POST"
      ? (reportBody = options.body, { ok: true, status: 200, json: async () => ({ success: true }) })
      : { ok: true, status: 200, json: async () => ({ job: {
          id: "job-2", device_id: "unknown-hosted-device",
          capability: "mikrotik.pppoe.secret.write"
        } }) },
    createApi: () => { apiCreated = true; throw new Error("must not create API"); }
  });
  await agent.pollOnce();
  assert.equal(apiCreated, false);
  assert.match(reportBody, /"failed"/);
});

test("refuses plaintext RouterOS API before opening a socket", async () => {
  let apiCreated = false, reportBody = "";
  const agent = new NetworkConnectorAgent({
    ...base,
    loadRouter: async id => ({ id, host: "192.0.2.1", api_port: 8728,
      credential_username: encryptedUsername, credential_password: encryptedPassword }),
    fetchImpl: async (_url, options) => options.method === "POST"
      ? (reportBody = options.body, { ok: true, status: 200, json: async () => ({ success: true }) })
      : { ok: true, status: 200, json: async () => ({ job: {
          id: "job-3", device_id: "hosted-router-1",
          capability: "mikrotik.identity.read"
        } }) },
    createApi: () => { apiCreated = true; throw new Error("must not create API"); }
  });
  await agent.pollOnce();
  assert.equal(apiCreated, false);
  assert.match(reportBody, /INSECURE_ROUTER_TRANSPORT/);
});
