import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const database = read("../src/config/database.js");
const workerReadme = read("../../worker/README.md");
const workerSource = read("../../worker/src/index.js");
const d1WorkerSource = read("../../worker/src/d1-api-worker.js");
const localAppSource = read("../src/app.js");
const userProfilePhoneMigration = read("../migrations/018_user_profile_phone.sql");
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


test("Hosted dashboard password reset uses the token flow supported by the D1 API", () => {
  assert.ok(dashboardSource.includes('call(setup?"/api/v1/tenants/register":"/api/v1/auth/login"'));
  assert.ok(d1WorkerSource.includes("path==='/api/tenants/register'"));
  assert.ok(d1WorkerSource.includes("path==='/api/auth/reset-password'&&m==='POST'"));
  assert.ok(d1WorkerSource.includes("consumePasswordReset"));
  assert.ok(d1WorkerSource.includes("issuePasswordReset"));
  assert.ok(!dashboardSource.includes("Password reset is not enabled on the hosted API yet"));
  assert.ok(!dashboardSource.includes("const localApi=(()=>"));
  assert.ok(dashboardSource.includes('call("/api/v1/auth/reset-password"'));
});

test("Hosted dashboard staff role choices are accepted by the D1 Worker", () => {
  assert.match(dashboardSource, /const roleChoices=\[\["billing","Billing"\],\["support","Customer support"\],\["technician","Network \/ NOC & Field Technician"\],\["staff","Limited staff"\]\]/);
  assert.match(d1WorkerSource, /const allowed=\['admin','billing','support','technician','staff'\]/);
  assert.doesNotMatch(dashboardSource, /\["noc","Network \/ NOC"\]/);
});


test("Cloudflare Pages routes API traffic to the environment-specific Worker without invoking Functions for static assets", () => {
  assert.ok(dashboardSource.includes('const local=["localhost","127.0.0.1"].includes(location.hostname)'));
  assert.ok(dashboardSource.includes('if(local)return location.port==="4000"?location.origin:"http://127.0.0.1:4000"'));
  assert.ok(dashboardSource.includes("return location.origin"));
  assert.doesNotMatch(dashboardSource, /https:\/\/nexus-saas-api\.harissaeed030\.workers\.dev/);
  assert.match(pagesProxy, /env\.API_URL\s*\|\|\s*env\.VITE_API_URL/);
  assert.match(pagesProxy, /new Request\(upstream, request\)/);
  assert.ok(packageJson.scripts.check.includes('node --input-type=module --check < "../functions/api/[[path]].js"'));
  assert.match(pagesProxy, /incoming\.pathname\.startsWith\("\/api\/"\)/);
  assert.deepEqual(pagesRoutes, { version: 1, include: ["/api/*"], exclude: [] });
  assert.match(portalSource, /fetch\("\/api\/v1\/customer-portal"/);
});

test("Profile and password settings are wired across local SQLite and hosted D1 APIs", () => {
  assert.ok(localAppSource.includes('app.get("/api/v1/profile",auth'));
  assert.ok(localAppSource.includes('app.put("/api/v1/profile",auth'));
  assert.ok(localAppSource.includes('app.put("/api/v1/profile/password",auth'));
  assert.ok(localAppSource.includes('req.path==="/api/v1/profile/password"'));
  assert.ok(localAppSource.includes('DELETE FROM sessions WHERE user_id=?'));
  assert.ok(d1WorkerSource.includes("if(path==='/api/profile'&&m==='GET')"));
  assert.ok(d1WorkerSource.includes("if(path==='/api/profile/password'&&m==='PUT')"));
  assert.ok(dashboardSource.includes('"Change Username / Password":"profile"'));
  assert.ok(dashboardSource.includes('d.user.fullName||d.user.name||d.user.email||"Workspace user"'));
  assert.ok(dashboardSource.includes('call("/api/v1/profile/password"'));
  assert.ok(userProfilePhoneMigration.includes("ALTER TABLE users ADD COLUMN phone TEXT"));
  assert.ok(database.includes("018_user_profile_phone"));
});

test("Local SQLite password reset consumes each token atomically before changing credentials", () => {
  const start = localAppSource.indexOf('app.post("/api/v1/auth/reset-password"');
  const end = localAppSource.indexOf('app.post("/api/v1/auth/logout"', start);
  const handler = localAppSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /withTransaction\(db,\(\)=>/);
  assert.match(handler, /UPDATE password_resets SET used_at=\? WHERE id=\? AND token_hash=\? AND used_at IS NULL AND expires_at>\?/);
  assert.match(handler, /consumed\.changes!==1/);
  assert.ok(handler.indexOf("UPDATE password_resets SET used_at") < handler.indexOf("UPDATE users SET password_hash"));
  assert.match(handler, /RESET_TOKEN_INVALID/);
  assert.match(handler, /target\.role==="admin"&&req\.user\.role!=="owner"/);
});
