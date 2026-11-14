import { resolve } from "node:path";
import { env } from "../src/config/env.js";
import { createDatabaseBackup } from "../src/lib/database-maintenance.js";

const source = resolve(env.databasePath);
const destination = resolve(process.argv[2] || "./backups/nexus-" + new Date().toISOString().replaceAll(":", "-") + ".sqlite");
try {
  const created = createDatabaseBackup(source, destination);
  console.log("SQLite backup created and validated:", created);
} catch (error) {
  console.error("Backup failed:", error.message);
  process.exitCode = 1;
}
