import { DatabaseSync } from "node:sqlite";
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const quoteSql = value => "'" + String(value).replaceAll("'", "''") + "'";
const stamp = () => new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");

export function validateDatabaseFile(filePath) {
  const file = resolve(filePath);
  if (!existsSync(file)) throw new Error("Database file does not exist.");
  const check = new DatabaseSync(file);
  try {
    check.exec("PRAGMA foreign_keys=ON");
    const integrity = check.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error("SQLite integrity_check failed.");
    }
    const violations = check.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) throw new Error("SQLite foreign_key_check found violations.");
    const required = ["tenants","users","sessions","customers","packages","subscriptions","invoices","payments","support_tickets","audit_logs"];
    const tables = new Set(check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const missing = required.filter(name => !tables.has(name));
    if (missing.length) throw new Error("Backup is missing required tables: " + missing.join(", "));
    return { valid: true, integrity: "ok", foreignKeyViolations: 0 };
  } finally {
    check.close();
  }
}

export function createDatabaseBackup(sourcePath, destinationPath) {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (source === destination) throw new Error("Backup destination must differ from the live database.");
  if (!existsSync(source)) throw new Error("Live database file does not exist.");
  if (existsSync(destination)) throw new Error("Backup destination already exists; refusing to overwrite it.");
  mkdirSync(dirname(destination), { recursive: true });
  const db = new DatabaseSync(source);
  try {
    db.exec("PRAGMA busy_timeout=10000");
    db.exec("VACUUM INTO " + quoteSql(destination));
  } finally {
    db.close();
  }
  try {
    chmodSync(destination, 0o600);
    validateDatabaseFile(destination);
    return destination;
  } catch (error) {
    rmSync(destination, { force: true });
    throw error;
  }
}

export function restoreDatabaseBackup({ databasePath, backupPath }) {
  const database = resolve(databasePath);
  const backup = resolve(backupPath);
  if (database === backup) throw new Error("Restore source must differ from the live database.");
  validateDatabaseFile(backup);
  mkdirSync(dirname(database), { recursive: true });

  // Ensure the active database is checkpointed before replacing its main file.
  if (existsSync(database)) {
    const active = new DatabaseSync(database);
    try {
      active.exec("PRAGMA busy_timeout=10000");
      active.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    } finally {
      active.close();
    }
    rmSync(database + "-wal", { force: true });
    rmSync(database + "-shm", { force: true });
  }

  const safetyCopy = existsSync(database)
    ? createDatabaseBackup(database, database + ".pre-restore-" + stamp() + ".sqlite")
    : null;
  const temporary = database + ".restore-" + stamp() + ".tmp";
  try {
    copyFileSync(backup, temporary);
    chmodSync(temporary, 0o600);
    validateDatabaseFile(temporary);
    if (existsSync(database)) renameSync(database, database + ".replaced-" + stamp());
    renameSync(temporary, database);
    validateDatabaseFile(database);
    return { restored: database, safetyCopy };
  } catch (error) {
    rmSync(temporary, { force: true });
    if (safetyCopy && !existsSync(database)) copyFileSync(safetyCopy, database);
    throw error;
  }
}
