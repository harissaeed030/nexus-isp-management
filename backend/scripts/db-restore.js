import { resolve } from "node:path";
import { env } from "../src/config/env.js";
import { restoreDatabaseBackup } from "../src/lib/database-maintenance.js";

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("Usage: npm run db:restore -- ./backups/nexus-backup.sqlite");
  process.exit(1);
}
try {
  const result = restoreDatabaseBackup({ databasePath: resolve(env.databasePath), backupPath: resolve(backupPath) });
  console.log("Database restored and validated:", result.restored);
  if (result.safetyCopy) console.log("Pre-restore safety backup retained:", result.safetyCopy);
  console.log("Start Nexus again; the versioned migration runner will apply any pending migrations.");
} catch (error) {
  console.error("Restore failed:", error.message);
  process.exitCode = 1;
}
