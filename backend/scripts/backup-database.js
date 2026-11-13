import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { db } from "../src/config/database.js";
import { env } from "../src/config/env.js";

const sourcePath = resolve(env.databasePath);
const backupDirectory = resolve(process.env.BACKUP_DIR || "./backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = resolve(backupDirectory, `nexus-${stamp}.sqlite`);

function sqlString(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

if (backupPath === sourcePath) {
  throw new Error("Backup destination must be different from the live database path.");
}

mkdirSync(dirname(backupPath), { recursive: true });
if (existsSync(backupPath)) {
  throw new Error("Backup destination already exists; refusing to overwrite it.");
}

try {
  // VACUUM INTO creates a consistent standalone SQLite snapshot, including
  // committed data that may currently reside in the source WAL file.
  db.exec(`VACUUM INTO ${sqlString(backupPath)}`);

  if (!existsSync(backupPath) || statSync(backupPath).size === 0) {
    throw new Error("SQLite did not create a non-empty backup file.");
  }

  const snapshot = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const check = snapshot.prepare("PRAGMA integrity_check").get();
    if (check?.integrity_check !== "ok") {
      throw new Error("Backup integrity check failed.");
    }
  } finally {
    snapshot.close();
  }

  console.log(JSON.stringify({
    success: true,
    backupPath,
    bytes: statSync(backupPath).size,
    integrity: "ok",
    createdAt: new Date().toISOString()
  }, null, 2));
} catch (error) {
  if (existsSync(backupPath)) rmSync(backupPath, { force: true });
  console.error("Database backup failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
