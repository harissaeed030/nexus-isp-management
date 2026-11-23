import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const database = read("../src/config/database.js");
const workerReadme = read("../../worker/README.md");
const workerSource = read("../../worker/src/index.js");
const d1WorkerSource = read("../../worker/src/d1-api-worker.js");
const dashboardSource = read("../../assets/js/app.js");
const pagesProxy = read("../../functions/api/[[path]].js");
const pagesRoutes = JSON.parse(read("../../_routes.json"));
const portalSource = read("../../assets/portal.js");
const wrangler = read("../../worker/wrangler.toml");
const architecture = read("../../docs/ARCHITECTURE.md");
const reconciliation = read("../../docs/DATABASE-ARCHITECTURE-RECONCILIATION.md");
const packageJson = JSON.parse(read("../package.json"));

test("SQLite and Cloudflare D1 remain separate runtimes", () => {
  assert.match(database, /from "node:sqlite"/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS tenants/);
  assert.match(database, /schema_migrations/);
  assert.match(workerReadme, /D1 API Worker \(staging\)/);
  assert.match(workerSource, /\/api\/health/);
  assert.match(wrangler, /name\s*=\s*"nexus-healthcheck-dev"/);
  assert.match(wrangler, /ENVIRONMENT\s*=\s*"development"/);
  assert.doesNotMatch(wrangler, /\[\[d1_databases\]\]|database_name\s*=/);
  assert.match(reconciliation, /tenants/);
  assert.match(reconciliation, /organizations/);
  assert.match(reconciliation, /tenant_id/);
  assert.match(reconciliation, /organization_id/);
  assert.match(reconciliation, /audit_logs/);
  assert.match(reconciliation, /audit_log/);
  assert.match(reconciliation, /Cloudflare D1 is the authoritative production source of truth/i);
  assert.match(reconciliation, /SQLite outbox → authenticated production Worker → D1/);
  assert.match(reconciliation, /not full database replication or bidirectional synchronization/i);
  assert.match(reconciliation, /Never run.*backend\/migrations.*against D1/i);
  assert.match(architecture, /must never be applied to D1/);
  assert.ok(packageJson.scripts.test.includes("architecture-boundaries.test.js"));
});


test("Hosted dashboard signup targets the D1 tenant registration route and password reset is not falsely advertised", () => {
  assert.match(dashboardSource, /call\(setup\?"\/api\/v1\/tenants\/register":"\/api\/v1\/auth\/login"/);
  assert.match(d1WorkerSource, /path==='\/api\/tenants\/register'\?'\/api\/auth\/register'/);
  assert.match(d1WorkerSource, /if\(path==='\/api\/auth\/register'&&m==='POST'\)return await authReg/);
  assert.match(dashboardSource, /Password reset is not enabled on the hosted API yet/);
  assert.doesNotMatch(dashboardSource, /call\("\/api\/v1\/auth\/reset-password"/);
});


test("Hosted dashboard staff role choices are accepted by the D1 Worker", () => {
  assert.match(dashboardSource, /const roleChoices=\[\["billing","Billing"\],\["support","Customer support"\],\["technician","Network \/ NOC & Field Technician"\],\["staff","Limited staff"\]\]/);
  assert.match(d1WorkerSource, /const allowed=\['admin','billing','support','technician','staff'\]/);
  assert.doesNotMatch(dashboardSource, /\["noc","Network \/ NOC"\]/);
});


test("Cloudflare Pages routes API traffic to the environment-specific Worker without invoking Functions for static assets", () => {
  assert.match(dashboardSource, /return location\.port==="4000"\?location\.origin:\(local\?"http:\/\/127\.0\.0\.1:4000":location\.origin\)/);
  assert.match(dashboardSource, /if\(pages\)sessionStorage\.removeItem\("nexus_api"\)/);
  assert.doesNotMatch(dashboardSource, /https:\/\/nexus-saas-api\.harissaeed030\.workers\.dev/);
  assert.match(pagesProxy, /env\.API_URL\s*\|\|\s*env\.VITE_API_URL/);
  assert.match(pagesProxy, /new Request\(upstream, request\)/);
  assert.match(pagesProxy, /incoming\.pathname\.startsWith\("\/api\/"\)/);
  assert.deepEqual(pagesRoutes, { version: 1, include: ["/api/*"], exclude: [] });
  assert.match(portalSource, /fetch\("\/api\/v1\/customer-portal"/);
});
