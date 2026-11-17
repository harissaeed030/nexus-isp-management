import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const port = Number(process.env.NEXUS_BENCH_PORT || 8799);
const origin = `http://127.0.0.1:${port}`;
const workerFiles = [
  resolve(repoRoot, "worker/src/index.js"),
  resolve(repoRoot, "worker/src/production-worker.js"),
];

for (const file of workerFiles) {
  const source = await readFile(file, "utf8");
  const hashFn = source.match(/async function hashPw\(pw,salt\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(hashFn, `hashPw function missing in ${file}`);
  assert.match(hashFn, /name:'PBKDF2'/);
  assert.match(hashFn, /hash:'SHA-256'/);
  assert.match(hashFn, /iterations:100000/);
  assert.match(source, /async function verifyPw\(pw,h,salt\)\{if\(!h\)return false;if\(!salt\)return pw===h;const\{hash\}=await hashPw\(pw,salt\);return hash===h\}/);
}
console.log("Source check: staging and production Worker both currently use PBKDF2-HMAC-SHA256 / 100,000 iterations.");

const config = resolve(here, "wrangler.password-benchmark.toml");
const child = spawn("npx", [
  "--yes", "wrangler@4", "dev", "--config", config,
  "--local", "--ip", "127.0.0.1", "--port", String(port),
], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });

let logs = "";
child.stdout.on("data", chunk => { logs += chunk.toString(); process.stdout.write(chunk); });
child.stderr.on("data", chunk => { logs += chunk.toString(); process.stderr.write(chunk); });
let exited = false;
child.on("exit", () => { exited = true; });

async function waitForServer() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (exited) throw new Error("Wrangler exited before becoming ready.\n" + logs);
    try {
      const response = await fetch(origin + "/health", { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for local Wrangler.\n" + logs);
}

try {
  await waitForServer();
  const response = await fetch(origin + "/bench", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ samples: 5, warmups: 1 }),
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.mode, "local-workerd-estimate");
  assert.equal(result.results?.length, 4);
  console.log("\nLocal workerd PBKDF2 benchmark (milliseconds):");
  for (const row of result.results) {
    console.log(`${row.iterations.toLocaleString()} iterations: median ${row.median_ms} ms; p95 ${row.p95_ms} ms; min/max ${row.min_ms}/${row.max_ms} ms`);
  }
  console.log("\nImportant: use Cloudflare's deployed Worker CPU profiler on a dedicated staging version before approving any iteration count.");
} finally {
  child.kill("SIGTERM");
}
