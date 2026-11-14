import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";

const dir = mkdtempSync(join(tmpdir(), "nexus-rate-limit-"));
process.env.SQLITE_PATH = join(dir, "rate-limit.sqlite");
process.env.CORS_ORIGINS = "http://localhost";
let db;
let server;
let base;
try {
  const { default: app } = await import("../src/app.js");
  ({ db } = await import("../src/config/database.js"));
  server = app.listen(0);
  await once(server, "listening");
  base = "http://127.0.0.1:" + server.address().port;
  const attempt = async () => fetch(base + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "rate-limit@example.test", password: "invalid-password" })
  });
  for (let i = 0; i < 10; i++) {
    const response = await attempt();
    assert.equal(response.status, 401, `Attempt ${i + 1} should be rejected as invalid credentials before the limit is reached.`);
  }
  const blocked = await attempt();
  assert.equal(blocked.status, 429, "The 11th failed login must be rate limited.");
  console.log("NEXUS rate-limit test passed: 10 invalid logins followed by HTTP 429 on attempt 11.");
} finally {
  if (server) {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
  db?.close();
  rmSync(dir, { recursive: true, force: true });
}
