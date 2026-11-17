import test from "node:test";
import assert from "node:assert/strict";
import { MikroTikReadOnlyAdapter, MIKROTIK_READ_CAPABILITIES } from "../src/services/mikrotik-readonly-adapter.js";

test("exposes only declared read capabilities", () => {
  const adapter = new MikroTikReadOnlyAdapter({ command: async () => [] });
  assert.deepEqual(adapter.capabilities(), MIKROTIK_READ_CAPABILITIES);
  assert.ok(adapter.capabilities().every(value => value.endsWith(".read")));
});

test("uses a bounded RouterOS command and property allow-list", async () => {
  const calls = [];
  const adapter = new MikroTikReadOnlyAdapter({
    command: async (path, params) => {
      calls.push({ path, params });
      return [{ name: "pppoe-1", address: "10.0.0.2", password: "must-not-leak", unexpected: "x" }];
    }
  });
  const rows = await adapter.read("mikrotik.pppoe.sessions.read");
  assert.deepEqual(calls, [{
    path: "/ppp/active/print",
    params: { ".proplist": ".id,name,service,caller-id,address,uptime,encoding" }
  }]);
  assert.deepEqual(rows, [{ name: "pppoe-1", address: "10.0.0.2" }]);
});

test("rejects write, arbitrary and unknown capabilities without calling RouterOS", async () => {
  let calls = 0;
  const adapter = new MikroTikReadOnlyAdapter({ command: async () => { calls++; return []; } });
  for (const capability of [
    "mikrotik.pppoe.secret.write",
    "/ppp/secret/remove",
    "mikrotik.unknown.read"
  ]) {
    await assert.rejects(() => adapter.read(capability), error =>
      error.code === "MIKROTIK_READ_CAPABILITY_UNAVAILABLE");
  }
  assert.equal(calls, 0);
});

test("rejects malformed RouterOS read responses", async () => {
  const adapter = new MikroTikReadOnlyAdapter({ command: async () => ({ name: "not-an-array" }) });
  await assert.rejects(() => adapter.read("mikrotik.identity.read"), /invalid read response/i);
});

test("constructor requires an API client with a command method", () => {
  assert.throws(() => new MikroTikReadOnlyAdapter({}), /API client/i);
});
