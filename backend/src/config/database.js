import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "./env.js";
const file=resolve(env.databasePath);mkdirSync(dirname(file),{recursive:true});
export const db=new DatabaseSync(file);
db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
db.exec(`
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),email TEXT NOT NULL,password_hash TEXT NOT NULL,full_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'owner',status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,email));
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),customer_code TEXT NOT NULL,full_name TEXT NOT NULL,phone TEXT,email TEXT,address TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,customer_code));
CREATE TABLE IF NOT EXISTS packages(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),name TEXT NOT NULL,speed_down_mbps INTEGER NOT NULL,speed_up_mbps INTEGER NOT NULL,monthly_price_pkr INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),customer_id TEXT NOT NULL REFERENCES customers(id),package_id TEXT NOT NULL REFERENCES packages(id),status TEXT NOT NULL DEFAULT 'active',started_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),customer_id TEXT NOT NULL REFERENCES customers(id),invoice_number TEXT NOT NULL,amount_pkr INTEGER NOT NULL,due_date TEXT,status TEXT NOT NULL DEFAULT 'unpaid',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,invoice_number));
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),invoice_id TEXT NOT NULL REFERENCES invoices(id),amount_pkr INTEGER NOT NULL,method TEXT NOT NULL,reference TEXT,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS support_tickets(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),customer_id TEXT NOT NULL REFERENCES customers(id),subject TEXT NOT NULL,description TEXT,priority TEXT NOT NULL DEFAULT 'normal',status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),actor_user_id TEXT,action TEXT NOT NULL,resource_type TEXT NOT NULL,resource_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS routers(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL, host TEXT NOT NULL, api_port INTEGER NOT NULL DEFAULT 8728,
 location TEXT, status TEXT NOT NULL DEFAULT 'configured', notes TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,host,api_port)
);
CREATE TABLE IF NOT EXISTS billing_runs(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 billing_period TEXT NOT NULL, invoices_created INTEGER NOT NULL DEFAULT 0,
 created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,billing_period)
);
CREATE TABLE IF NOT EXISTS user_permissions(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 permission TEXT NOT NULL,
 allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
 updated_by TEXT REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,user_id,permission)
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(tenant_id,user_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_routers_tenant ON routers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status ON subscriptions(tenant_id,status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_received ON payments(tenant_id,received_at);

);

db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
const migrationVersion = "001_database_hardening";
if (!db.prepare("SELECT version FROM schema_migrations WHERE version=?").get(migrationVersion)) {
  const migrationSql = readFileSync(new URL("../../migrations/001_database_hardening.sql", import.meta.url), "utf8");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(migrationSql);
    db.prepare("INSERT INTO schema_migrations(version) VALUES(?)").run(migrationVersion);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve migration failure */ }
    throw error;
  }
}

export function getDatabaseStatus(){return "connected";}
