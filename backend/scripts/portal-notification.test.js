import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("customer portal migration creates isolated accounts and notification outbox",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(`
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT,slug TEXT);
 CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT);
 CREATE TABLE customers(id TEXT PRIMARY KEY,tenant_id TEXT,customer_code TEXT,full_name TEXT);
 CREATE TABLE subscriptions(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT);
 CREATE TABLE invoices(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT);
 CREATE TABLE support_tickets(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT);
 `);
 const sql=readFileSync(new URL("../migrations/003_customer_portal_notifications.sql",import.meta.url),"utf8");
 db.exec(sql);
 for(const table of ["customer_portal_accounts","customer_portal_sessions","notification_templates","notification_outbox"])
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
 db.prepare("INSERT INTO tenants(id,name,slug) VALUES('t1','ISP One','isp-one'),('t2','ISP Two','isp-two')").run();
 db.prepare("INSERT INTO customers(id,tenant_id,customer_code,full_name) VALUES('c1','t1','NXS-1','One'),('c2','t2','NXS-1','Two')").run();
 assert.throws(()=>db.prepare("INSERT INTO customer_portal_accounts(id,tenant_id,customer_id,password_hash) VALUES('a1','t1','c2','hash')").run(),/tenant mismatch/);
 db.prepare("INSERT INTO customer_portal_accounts(id,tenant_id,customer_id,password_hash) VALUES('a1','t1','c1','hash')").run();
 db.prepare("INSERT INTO customer_portal_sessions(token_hash,account_id,expires_at) VALUES('token','a1','2099-01-01T00:00:00.000Z')").run();
 assert.equal(db.prepare("SELECT COUNT(*) count FROM customer_portal_sessions").get().count,1);
 db.close();
});
