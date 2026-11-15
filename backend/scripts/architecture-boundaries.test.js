import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const database = read("../src/config/database.js");
const workerReadme = read("../../worker/README.md");
const workerSource = read("../../worker/src/index.js");
const wrangler = read("../../worker/wrangler.toml");
const architecture = read("../../docs/ARCHITECTURE.md");
const reconciliation = read("../../docs/DATABASE-ARCHITECTURE-RECONCILIATION.md");
const packageJson = JSON.parse(read("../package.json"));

test("SQLite and Cloudflare D1 remain separate runtimes", () => {
  assert.match(database, /from "node:sqlite"/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS tenants/);
  assert.match(database, /schema_migrations/);
  assert.match(workerReadme, /minimal Cloudflare Worker\/D1 health-check foundation/);
  assert.match(workerReadme, /Never apply them to a Cloudflare D1 database/);
  assert.match(workerSource, /\/api\/health/);
  assert.match(wrangler, /database_name\s*=\s*"nexus-db"/);
  assert.match(reconciliation, /tenants/);
  assert.match(reconciliation, /organizations/);
  assert.match(reconciliation, /tenant_id/);
  assert.match(reconciliation, /organization_id/);
  assert.match(reconciliation, /audit_logs/);
  assert.match(reconciliation, /audit_log/);
  assert.match(reconciliation, /Cloudflare D1 is the authoritative production source of truth/i);
  assert.match(reconciliation, /SQLite outbox → authenticated production Worker → D1/);
  assert.match(reconciliation, /no SQLite-to-D1 import, export, replication or bidirectional synchronization/i);
  assert.match(reconciliation, /Never run.*backend\/migrations.*against D1/i);
  assert.match(architecture, /must never be applied to D1/);
  assert.ok(packageJson.scripts.test.includes("architecture-boundaries.test.js"));
});
