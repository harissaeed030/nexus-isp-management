import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hashResetToken } from "../src/d1-api-worker.js";

const source = await readFile(new URL("../src/d1-api-worker.js", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../assets/js/app.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../../cloudflare/d1/migrations/0022_password_reset_tokens.sql", import.meta.url), "utf8");

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
  assert.match(dashboard, /<p>Account recovery<\\/p>/);
});

test("password reset redemption is public only with a high-entropy one-time token", () => {
  const publicRoute = source.indexOf("path==='/api/auth/reset-password'&&m==='POST'");
  const authGate = source.indexOf("const auth=await getAuth(request,env)");
  assert.ok(publicRoute >= 0 && publicRoute < authGate);
  assert.match(source, /tokenHash=await hashResetToken\(body\.token\)/);
  assert.match(source, /used_at IS NULL AND expires_at>\?/);
  assert.match(source, /password_hash=\?,password_salt=\?,token_version=COALESCE\(token_version,0\)\+1/);
  assert.match(source, /Reset token is invalid, used or expired/);
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
  assert.match(migration, /VALUES \(22, '0022_password_reset_tokens'/);
});
