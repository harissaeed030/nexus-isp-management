import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = (name) => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8");
const applyOnce = (db, version, filename) => {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(version)) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(migration(filename));
    db.prepare("INSERT INTO schema_migrations(version) VALUES(?)").run(version);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

test("migration versions 007-009 are unique, additive and restart-safe", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(`
      CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT,slug TEXT UNIQUE);
      CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),email TEXT,password_hash TEXT,full_name TEXT);
      CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE customers(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),customer_code TEXT,full_name TEXT,phone TEXT,address TEXT);
      CREATE TABLE packages(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),name TEXT,speed_down_mbps INTEGER,speed_up_mbps INTEGER,monthly_price_pkr INTEGER);
      CREATE TABLE subscriptions(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),customer_id TEXT,package_id TEXT,status TEXT,started_at TEXT);
      CREATE TABLE invoices(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),customer_id TEXT,invoice_number TEXT,amount_pkr INTEGER,due_date TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE payments(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),invoice_id TEXT,amount_pkr INTEGER,method TEXT,reference TEXT,received_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE support_tickets(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),customer_id TEXT,subject TEXT,description TEXT,priority TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE audit_logs(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),actor_user_id TEXT,action TEXT,resource_type TEXT,resource_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE routers(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),name TEXT,host TEXT,api_port INTEGER);
      CREATE TABLE billing_runs(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),billing_period TEXT,invoices_created INTEGER,created_by TEXT);
      CREATE TABLE user_permissions(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),user_id TEXT,permission TEXT,allowed INTEGER,updated_by TEXT);
      CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
    `);
    db.exec("INSERT INTO tenants(id,name,slug) VALUES('t','Test','test')");
    db.exec("INSERT INTO users(id,tenant_id,email,password_hash,full_name) VALUES('u','t','owner@test','hash','Owner')");
    db.exec("INSERT INTO customers(id,tenant_id,customer_code,full_name) VALUES('c','t','C-1','Customer')");
    db.exec("INSERT INTO packages(id,tenant_id,name,speed_down_mbps,speed_up_mbps,monthly_price_pkr) VALUES('p','t','10M',10,10,1000)");
    db.exec("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,amount_pkr,due_date,status) VALUES('i','t','c','OLD-1',1000,'2030-01-01','unpaid')");
    db.exec("INSERT INTO payments(id,tenant_id,invoice_id,amount_pkr,method) VALUES('pay','t','i',250,'cash')");
    db.exec("INSERT INTO schema_migrations(version) VALUES('001_database_hardening'),('002_customer_subscription_management'),('003_mikrotik_integration'),('004_olt_onu_management'),('005_tr069_genieacs'),('006_customer_portal_notifications')");

    assert.equal(applyOnce(db, "007_isp_business_modules", "007_isp_business_modules.sql"), true);
    assert.equal(applyOnce(db, "008_financial_management", "008_financial_management.sql"), true);
    assert.equal(applyOnce(db, "009_session_hardening", "009_session_hardening.sql"), true);
    assert.equal(applyOnce(db, "007_isp_business_modules", "007_isp_business_modules.sql"), false);
    assert.equal(applyOnce(db, "008_financial_management", "008_financial_management.sql"), false);
    assert.equal(applyOnce(db, "009_session_hardening", "009_session_hardening.sql"), false);

    assert.equal(db.prepare("SELECT COUNT(*) n FROM invoices").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM payments").get().n, 1);
    assert.equal(db.prepare("SELECT amount_pkr FROM payments WHERE id='pay'").get().amount_pkr, 250);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='coverage_areas'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='credit_notes'").get());
    assert.ok(db.prepare("SELECT 1 FROM pragma_table_info('sessions') WHERE name='last_seen_at'").get());

    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map(row => row.version);
    assert.equal(new Set(versions).size, versions.length);
    assert.deepEqual(versions.slice(-3), ["007_isp_business_modules", "008_financial_management", "009_session_hardening"]);
  } finally {
    db.close();
  }
});
