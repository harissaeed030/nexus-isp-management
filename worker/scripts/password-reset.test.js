import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { requestPasswordReset, consumePasswordReset } from "../src/password-reset.js";

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.db.sqlite.prepare(this.sql).all(...this.values) }; }
  async run() {
    const result = this.db.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
}
class D1Fixture {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE organizations(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE);
      CREATE TABLE users(
        id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,email TEXT NOT NULL,
        password_hash TEXT NOT NULL,password_salt TEXT,status TEXT NOT NULL DEFAULT 'active',
        token_version INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE login_attempts(
        id TEXT PRIMARY KEY,ip_address TEXT NOT NULL,email TEXT NOT NULL,
        attempted_at TEXT NOT NULL DEFAULT(datetime('now'))
      );
      CREATE TABLE password_resets(
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT(datetime('now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE audit_log(
        id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,user_id TEXT,action TEXT NOT NULL,
        detail TEXT,ip_address TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO organizations(id,slug) VALUES('org-1','vancom');
      INSERT INTO users(id,organization_id,email,password_hash,password_salt,status,token_version)
        VALUES('user-1','org-1','owner@vancom.test','old-hash','old-salt','active',0);
    `);
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => {
        const result = this.sqlite.prepare(statement.sql).run(...statement.values);
        return { success: true, meta: { changes: Number(result.changes || 0) } };
      });
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}
const envFor = DB => ({
  DB, RESEND_API_KEY: "re_test_only",
  PASSWORD_RESET_FROM: "NEXUS Test <no-reply@example.test>",
  PASSWORD_RESET_URL: "https://nexus.example.test/login"
});
const request = (body) => new Request("https://api.example.test/api/auth/password-reset/request", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
const consumeRequest = (body) => new Request("https://api.example.test/api/auth/reset-password", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

test("request uses a generic response, emails a fragment token, and stores only its SHA-256 digest", async () => {
  const fixture = new D1Fixture(), originalFetch = globalThis.fetch;
  let sentEmail;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.headers.Authorization, "Bearer re_test_only");
    sentEmail = JSON.parse(options.body);
    return new Response("{}", { status: 200 });
  };
  try {
    const env = envFor(fixture);
    const known = await requestPasswordReset(request({ email: "OWNER@VANCOM.TEST", workspaceSlug: "vancom" }), env, "203.0.113.10");
    const unknown = await requestPasswordReset(request({ email: "missing@vancom.test", workspaceSlug: "vancom" }), env, "203.0.113.11");
    assert.equal(known.status, 200);
    assert.deepEqual(await known.json(), await unknown.json());
    assert.equal(sentEmail.to[0], "owner@vancom.test");
    assert.match(sentEmail.text, /expires in 30 minutes/);
    const match = sentEmail.text.match(/https:\/\/nexus\.example\.test\/login#reset=([A-Za-z0-9_-]{43})/);
    assert.ok(match, "email has a one-time token in the URL fragment");
    const token = match[1], tokenHash = await digest(token);
    const stored = fixture.sqlite.prepare("SELECT token,expires_at,used FROM password_resets WHERE user_id='user-1'").get();
    assert.equal(stored.token, tokenHash);
    assert.notEqual(stored.token, token);
    assert.equal(stored.used, 0);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='password_reset_requested'").get().n, 1);

    const consumed = await consumePasswordReset(consumeRequest({ token, newPassword: "New-Strong-Password-2026" }), env, "203.0.113.10");
    assert.equal(consumed.status, 200);
    const user = fixture.sqlite.prepare("SELECT password_hash,password_salt,token_version FROM users WHERE id='user-1'").get();
    assert.match(user.password_hash, /^[a-f0-9]{64}$/);
    assert.match(user.password_salt, /^[a-f0-9]{32}$/);
    assert.equal(user.token_version, 1);
    assert.equal(fixture.sqlite.prepare("SELECT used FROM password_resets WHERE token=?").get(tokenHash).used, 1);
    const reused = await consumePasswordReset(consumeRequest({ token, newPassword: "Another-Strong-Password-2026" }), env, "203.0.113.10");
    assert.equal(reused.status, 400);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='password_reset_completed'").get().n, 1);
  } finally { globalThis.fetch = originalFetch; fixture.close(); }
});

test("request is non-enumerating and sends no email when delivery settings are missing", async () => {
  const fixture = new D1Fixture(), originalFetch = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends++; return new Response("{}", { status: 200 }); };
  try {
    const env = envFor(fixture); delete env.RESEND_API_KEY;
    const response = await requestPasswordReset(request({ email: "owner@vancom.test" }), env, "203.0.113.20");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal("token" in body, false);
    assert.equal(sends, 0);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM password_resets").get().n, 0);
  } finally { globalThis.fetch = originalFetch; fixture.close(); }
});

test("request throttles repeated attempts by normalized email", async () => {
  const fixture = new D1Fixture(), originalFetch = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends++; return new Response("{}", { status: 200 }); };
  try {
    const env = envFor(fixture);
    for (let i = 0; i < 11; i++) {
      const response = await requestPasswordReset(request({ email: "owner@vancom.test" }), env, "203.0.113.30");
      assert.equal(response.status, 200);
    }
    assert.equal(sends, 10);
  } finally { globalThis.fetch = originalFetch; fixture.close(); }
});

test("failed email delivery invalidates the pending token and does not expose provider errors", async () => {
  const fixture = new D1Fixture(), originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("provider error", { status: 500 });
  try {
    const response = await requestPasswordReset(request({ email: "owner@vancom.test" }), envFor(fixture), "203.0.113.40");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal("token" in body, false);
    assert.equal(fixture.sqlite.prepare("SELECT used FROM password_resets").get().used, 1);
  } finally { globalThis.fetch = originalFetch; fixture.close(); }
});

test("expired and malformed reset tokens cannot change a password", async () => {
  const fixture = new D1Fixture();
  try {
    const env = envFor(fixture), malformed = await consumePasswordReset(
      consumeRequest({ token: "not-a-token", newPassword: "New-Strong-Password-2026" }), env
    );
    assert.equal(malformed.status, 400);
    const token = "A".repeat(43), tokenHash = await digest(token);
    fixture.sqlite.prepare("INSERT INTO password_resets(id,user_id,token,expires_at,used) VALUES(?,?,?,?,0)")
      .run("expired", "user-1", tokenHash, "2000-01-01 00:00:00");
    const expired = await consumePasswordReset(
      consumeRequest({ token, newPassword: "New-Strong-Password-2026" }), env
    );
    assert.equal(expired.status, 400);
    assert.equal(fixture.sqlite.prepare("SELECT password_hash FROM users WHERE id='user-1'").get().password_hash, "old-hash");
  } finally { fixture.close(); }
});


test("password reset throttling is isolated from login throttling", async () => {
  const fixture = new D1Fixture(), originalFetch = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends++; return new Response("{}", { status: 200 }); };
  try {
    const env = envFor(fixture);
    // Simulate a full normal-login email/IP throttle window.
    for (let i = 0; i < 10; i++) {
      fixture.sqlite.prepare("INSERT INTO login_attempts(id,ip_address,email) VALUES(?,?,?)")
        .run("login-" + i, "203.0.113.50", "owner@vancom.test");
    }
    const response = await requestPasswordReset(
      request({ email: "owner@vancom.test" }), env, "203.0.113.50"
    );
    assert.equal(response.status, 200);
    assert.equal(sends, 1, "login attempts must not block password recovery");
    assert.equal(
      fixture.sqlite.prepare("SELECT COUNT(*) n FROM login_attempts WHERE ip_address=? AND email=?")
        .get("203.0.113.50", "owner@vancom.test").n,
      10,
      "password reset must not append to the normal login throttle bucket"
    );
    assert.equal(
      fixture.sqlite.prepare("SELECT COUNT(*) n FROM login_attempts WHERE ip_address=? AND email=?")
        .get("password-reset:203.0.113.50", "password-reset:owner@vancom.test").n,
      1
    );
  } finally { globalThis.fetch = originalFetch; fixture.close(); }
});
