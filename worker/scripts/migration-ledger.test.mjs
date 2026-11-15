import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/migration-runner.js';

function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE organizations(id TEXT PRIMARY KEY);
    CREATE TABLE users(id TEXT PRIMARY KEY, organization_id TEXT, name TEXT);
    CREATE TABLE customers(id TEXT PRIMARY KEY, organization_id TEXT);
    CREATE TABLE subscriptions(id TEXT PRIMARY KEY, organization_id TEXT);
    CREATE TABLE packages(id TEXT PRIMARY KEY, organization_id TEXT);
    CREATE TABLE invoices(id TEXT PRIMARY KEY, organization_id TEXT, customer_id TEXT, subscription_id TEXT, invoice_number TEXT);
    CREATE TABLE payments(id TEXT PRIMARY KEY, organization_id TEXT, invoice_id TEXT, customer_id TEXT, transaction_ref TEXT);
    CREATE TABLE network_devices(id TEXT PRIMARY KEY, organization_id TEXT);
    CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT(datetime('now')));
  `);
  const DB = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        run() {
          const result = sqlite.prepare(sql).run(...this.values);
          return { meta: { changes: Number(result.changes) } };
        },
        first() {
          return sqlite.prepare(sql).get(...this.values) ?? null;
        }
      };
    }
  };
  return { sqlite, env: { DB } };
}

test('D1 migrations are recorded durably and skipped on subsequent Worker isolates', async () => {
  const { sqlite, env } = createD1();
  try {
    // Simulate a legacy database where one additive column already exists
    // but the durable migration ledger has not yet been populated.
    const first = await runMigrations(env);
    assert.ok(first.length >= 30, 'expected the complete D1 migration set to run');
    const recorded = sqlite.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
    assert.equal(recorded, first.length);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE name=?').get('users.name').n, 1);

    // A fresh module/Worker isolate will call the runner again. Every migration
    // must be skipped from the persistent ledger rather than replayed.
    const second = await runMigrations(env);
    assert.equal(second.length, first.length);
    assert.ok(second.every(item => item.endsWith(':SKIP')));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, recorded);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_schema_migrations_name'").get().n, 1);
  } finally {
    sqlite.close();
  }
});
