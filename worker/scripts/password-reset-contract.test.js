import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { hashResetToken } from "../src/d1-api-worker.js";

const source = await readFile(new URL("../src/d1-api-worker.js", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../assets/js/app.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../../cloudflare/d1/migrations/0026_password_reset_tokens.sql", import.meta.url), "utf8");

test("reset tokens are stored as deterministic SHA-256 hashes, never plaintext", async () => {
  const first = await hashResetToken("a-long-one-time-reset-token");
  const second = await hashResetToken("a-long-one-time-reset-token");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, await hashResetToken("a-different-reset-token"));
});

test("staff password reset issuance is an authenticated staff-management route", () => {
  assert.match(source, /password-reset.*issuePasswordReset/);
  assert.match(source, /if\(!\['owner','admin'\]\.includes\(actorRole\)\)/);
  assert.match(source, /Only the owner can reset administrator passwords/);
  assert.match(source, /expiresAt=new Date\(Date\.now\(\)\+30\*60\*1000\)/);
  assert.match(dashboard, /\/api\/v1\/staff\/[\s\S]*?password-reset/);
  assert.doesNotMatch(dashboard, /Password reset is not enabled on the hosted API yet/);
  assert.ok(dashboard.includes("<p>Account recovery</p>"));
});

test("password reset redemption is public only with a high-entropy one-time token", () => {
  const publicRoute = source.indexOf("path==='/api/auth/reset-password'&&m==='POST'");
  const authGate = source.indexOf("const auth=await getAuth(request,env)");
  assert.ok(publicRoute >= 0 && publicRoute < authGate);
  assert.match(source, /tokenHash=await hashResetToken\(body\.token\)/);
  assert.match(source, /used_at IS NULL AND expires_at>\?/);
  assert.match(source, /password_hash=\?,password_salt=\?,token_version=COALESCE\(token_version,0\)\+1/);
  assert.match(source, /Reset token is invalid, used or expired/);
  assert.match(source, /loginRateLimited\(env,ip,rateKey\)/);
  assert.match(source, /Too many password reset attempts/);
  assert.match(source, /recordLoginFailure\(env,ip,rateKey\)/);
});

test("reset token redemption consumes the token before changing the password", () => {
  const start = source.indexOf("async function consumePasswordReset");
  const end = source.indexOf("async function getSub", start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(handler.indexOf("UPDATE password_reset_tokens SET used_at") < handler.indexOf("UPDATE users SET password_hash"));
  assert.match(handler, /UPDATE password_reset_tokens SET used_at=\? WHERE organization_id=\? AND user_id=\? AND used_at IS NULL/);
});

test("runtime bootstrap and numbered D1 migration both create reset-token storage", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS password_reset_tokens/);
  assert.match(source, /idx_password_reset_tokens_org_user/);
  assert.ok(source.indexOf("['users.rebuild','SPECIAL']") < source.indexOf("['password_reset_tokens',\"CREATE TABLE"));
  assert.match(migration, /CREATE TABLE IF NOT EXISTS password_reset_tokens/);
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.ok(source.includes("trg_password_reset_tokens_tenant_guard"));
  assert.ok(migration.includes("BEFORE INSERT ON password_reset_tokens"));
  assert.ok(migration.includes("WHERE id = NEW.user_id AND organization_id = NEW.organization_id"));
  assert.match(migration, /VALUES \(26, '0026_password_reset_tokens'/);
});

test("D1 migration 0026 applies cleanly without overwriting deployed migration 0022", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("CREATE TABLE organizations(id TEXT PRIMARY KEY)");
    db.exec("CREATE TABLE users(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, FOREIGN KEY(organization_id) REFERENCES organizations(id))");
    db.exec("CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    db.prepare("INSERT INTO schema_migrations(id,name,applied_at) VALUES(22,'0022_payment_promises','2026-11-24'),(25,'0025_payment_promises_updated_by_guard','2026-11-24'),(100,'sync_ledger_and_failures_tables','2026-11-16')").run();
    db.exec(migration);
    const versions = db.prepare("SELECT id,name FROM schema_migrations ORDER BY id").all();
    assert.ok(versions.some(row => row.id === 22 && row.name === "0022_payment_promises"));
    assert.ok(versions.some(row => row.id === 26 && row.name === "0026_password_reset_tokens"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'").get().n, 1);
    db.exec("INSERT INTO organizations(id) VALUES('org-a'),('org-b')");
    db.exec("INSERT INTO users(id,organization_id) VALUES('owner-a','org-a'),('owner-b','org-b')");
    assert.throws(() => db.prepare("INSERT INTO password_reset_tokens(id,organization_id,user_id,token_hash,expires_at,created_by) VALUES('bad-user','org-a','owner-b','hash-bad-user','2099-01-01','owner-a')").run());
    assert.throws(() => db.prepare("INSERT INTO password_reset_tokens(id,organization_id,user_id,token_hash,expires_at,created_by) VALUES('bad-actor','org-a','owner-a','hash-bad-actor','2099-01-01','owner-b')").run());
    db.prepare("INSERT INTO password_reset_tokens(id,organization_id,user_id,token_hash,expires_at,created_by) VALUES('good','org-a','owner-a','hash-good','2099-01-01','owner-a')").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_reset_tokens").get().n, 1);
  } finally {
    db.close();
  }
});
