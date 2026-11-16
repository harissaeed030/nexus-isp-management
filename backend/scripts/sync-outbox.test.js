import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  claimOutboxBatch,
  toSyncOperations,
  markOutboxSynced,
  markOutboxFailed,
  requeueQuarantined
} from "../src/services/sync-outbox.js";

let db;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE tenants(id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE customers(
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_code TEXT NOT NULL,
      full_name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT,
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE packages(
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      speed_down_mbps INTEGER NOT NULL, speed_up_mbps INTEGER NOT NULL,
      monthly_price_pkr INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE subscriptions(
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
      package_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE invoices(
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL, amount_pkr INTEGER NOT NULL, due_date TEXT,
      status TEXT NOT NULL DEFAULT 'unpaid', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE payments(
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
      amount_pkr INTEGER NOT NULL, method TEXT NOT NULL, reference TEXT,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("tenant-1", "Test ISP");
  db.exec(readFileSync(new URL("../migrations/011_sqlite_sync_outbox.sql", import.meta.url), "utf8"));
});
afterEach(() => db?.close());

function addCustomer(id = "customer-1") {
  db.prepare("INSERT INTO customers(id,tenant_id,customer_code,full_name) VALUES(?,?,?,?)")
    .run(id, "tenant-1", "C-" + id, "Test Customer");
  return db.prepare("SELECT * FROM sync_outbox WHERE entity_id=?").get(id);
}

test("business write and outbox event commit or roll back atomically", () => {
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO customers(id,tenant_id,customer_code,full_name) VALUES(?,?,?,?)")
    .run("rolled-back", "tenant-1", "C-RB", "Rollback Customer");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n, 1);
  db.exec("ROLLBACK");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customers").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n, 0);
  addCustomer("committed");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE entity_id='committed'").get().n, 1);
});

test("claim is bounded, increments attempts, and expired leases can be reclaimed", () => {
  addCustomer();
  const first = claimOutboxBatch(db, { limit: 1, leaseMs: 60_000 });
  assert.equal(first.length, 1);
  assert.equal(first[0].state, "inflight");
  assert.equal(first[0].attempts, 1);
  assert.equal(claimOutboxBatch(db).length, 0);
  db.prepare("UPDATE sync_outbox SET lease_until=? WHERE operation_id=?")
    .run("2000-01-01T00:00:00.000Z", first[0].operation_id);
  const reclaimed = claimOutboxBatch(db);
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].attempts, 2);
});

test("failed delivery schedules retry with backoff and clears the lease", () => {
  const row = addCustomer();
  const [claimed] = claimOutboxBatch(db);
  assert.equal(markOutboxFailed(db, row.operation_id, "NETWORK_TIMEOUT"), true);
  const saved = db.prepare("SELECT * FROM sync_outbox WHERE operation_id=?").get(row.operation_id);
  assert.equal(saved.state, "pending");
  assert.equal(saved.lease_until, null);
  assert.equal(saved.last_error_code, "NETWORK_TIMEOUT");
  assert.ok(Date.parse(saved.next_attempt_at) > Date.now());
  assert.equal(claimOutboxBatch(db).length, 0);
});

test("maximum attempts quarantine an event and explicit requeue resets retry state", () => {
  const row = addCustomer();
  const [claimed] = claimOutboxBatch(db);
  db.prepare("UPDATE sync_outbox SET attempts=11 WHERE operation_id=?").run(row.operation_id);
  // A fresh claim increments attempts to the configured maximum.
  db.prepare("UPDATE sync_outbox SET lease_until=? WHERE operation_id=?")
    .run("2000-01-01T00:00:00.000Z", row.operation_id);
  const [lastClaim] = claimOutboxBatch(db);
  assert.equal(lastClaim.attempts, 12);
  assert.equal(markOutboxFailed(db, row.operation_id, "REJECTED"), true);
  assert.equal(db.prepare("SELECT state FROM sync_outbox WHERE operation_id=?").get(row.operation_id).state, "quarantined");
  assert.equal(requeueQuarantined(db, row.operation_id), true);
  const reset = db.prepare("SELECT * FROM sync_outbox WHERE operation_id=?").get(row.operation_id);
  assert.equal(reset.state, "pending");
  assert.equal(reset.attempts, 0);
  assert.equal(reset.last_error_code, null);
});

test("stored allowlisted event maps to a validated tenant-scoped sync operation", () => {
  const row = addCustomer();
  const [claimed] = claimOutboxBatch(db);
  const [operation] = toSyncOperations([claimed], tenantId => {
    assert.equal(tenantId, "tenant-1");
    return "organization-prod-1";
  });
  assert.equal(operation.entity, "customer");
  assert.equal(operation.entityId, "customer-1");
  assert.equal(operation.payload.organization_id, "organization-prod-1");
  assert.equal(operation.payload.id, "customer-1");
});

test("successful acknowledgement only marks claimed operations synced", () => {
  const row = addCustomer();
  claimOutboxBatch(db);
  markOutboxSynced(db, [row.operation_id]);
  const saved = db.prepare("SELECT * FROM sync_outbox WHERE operation_id=?").get(row.operation_id);
  assert.equal(saved.state, "synced");
  assert.ok(saved.synced_at);
  assert.equal(saved.lease_until, null);
  assert.equal(markOutboxFailed(db, row.operation_id, "LATE_FAILURE"), false);
});
