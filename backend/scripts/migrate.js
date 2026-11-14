import { db } from "../src/config/database.js";

const rows = db.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version").all();
console.log(JSON.stringify({ status: "ok", appliedMigrations: rows }, null, 2));
db.close();
