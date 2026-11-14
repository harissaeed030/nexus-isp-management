import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTransaction } from "../src/lib/transactions.js";
import { createDatabaseBackup, restoreDatabaseBackup, validateDatabaseFile } from "../src/lib/database-maintenance.js";

const requiredTables = ["tenants","users","sessions","customers","packages","subscriptions","invoices","payments","support_tickets","audit_logs"];
function createFixture(file, marker) {
  const db = new DatabaseSync(file);
  try {
    for (const table of requiredTables) db.exec("CREATE TABLE " + table + "(id TEXT PRIMARY KEY, marker TEXT)");
    db.prepare("INSERT INTO tenants(id,marker) VALUES('tenant',?)").run(marker);
  } finally { db.close(); }
}

test("transaction helper rolls back every write after an exception", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE records(value TEXT)");
    assert.throws(() => withTransaction(db, () => {
      db.prepare("INSERT INTO records(value) VALUES(?)").run("must rollback");
      throw new Error("forced failure");
    }), /forced failure/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM records").get().n, 0);
  } finally { db.close(); }
});

test("backup is integrity-checked and restore preserves the pre-restore safety copy", () => {
  const dir = mkdtempSync(join(tmpdir(), "nexus-db-hardening-"));
  const live = join(dir, "live.sqlite");
  const source = join(dir, "source.sqlite");
  const backup = join(dir, "backup.sqlite");
  try {
    createFixture(live, "live-before-restore");
    createFixture(source, "backup-value");
    createDatabaseBackup(source, backup);
    assert.deepEqual(validateDatabaseFile(backup), { valid: true, integrity: "ok", foreignKeyViolations: 0 });
    const invalid = join(dir, "invalid.sqlite");
    writeFileSync(invalid, "not a sqlite database");
    assert.throws(() => restoreDatabaseBackup({ databasePath: live, backupPath: invalid }));
    const beforeRestore = new DatabaseSync(live);
    try { assert.equal(beforeRestore.prepare("SELECT marker FROM tenants WHERE id='tenant'").get().marker, "live-before-restore"); }
    finally { beforeRestore.close(); }
    const restored = restoreDatabaseBackup({ databasePath: live, backupPath: backup });
    assert.equal(existsSync(restored.safetyCopy), true);
    const db = new DatabaseSync(live);
    try {
      assert.equal(db.prepare("SELECT marker FROM tenants WHERE id='tenant'").get().marker, "backup-value");
    } finally { db.close(); }
    assert.throws(() => createDatabaseBackup(source, backup), /already exists/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
