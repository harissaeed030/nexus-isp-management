import { chmodSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "../src/config/env.js";
import { db } from "../src/config/database.js";

const backupDir = resolve(env.backupPath);
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = join(backupDir, `nexus-${stamp}.sqlite`);
const escaped = target.replaceAll("'", "''");

try {
  db.exec(`VACUUM INTO '${escaped}'`);
  chmodSync(target, 0o600);
  const check = new DatabaseSync(target, { readOnly: true });
  const result = check.prepare("PRAGMA quick_check").get();
  check.close();
  if (!result || Object.values(result)[0] !== "ok") throw new Error("Backup integrity check failed.");
  const sizeBytes = statSync(target).size;
  console.log(JSON.stringify({ status: "ok", file: target, sizeBytes, createdAt: new Date().toISOString() }));
} catch (error) {
  console.error(JSON.stringify({ status: "error", message: error.message }));
  process.exitCode = 1;
} finally {
  db.close();
}
