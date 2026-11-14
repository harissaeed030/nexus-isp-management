import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { nextInvoiceNumber, invoiceBalance, syncInvoiceStatus } from "../src/lib/financial.js";
test("financial migration and ledger balance preserve append-only reversals and credits",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT,slug TEXT UNIQUE); CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,email TEXT,password_hash TEXT,full_name TEXT); CREATE TABLE customers(id TEXT PRIMARY KEY,tenant_id TEXT,customer_code TEXT,full_name TEXT); CREATE TABLE packages(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,speed_down_mbps INTEGER,speed_up_mbps INTEGER,monthly_price_pkr INTEGER); CREATE TABLE subscriptions(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT,package_id TEXT,status TEXT,started_at TEXT); CREATE TABLE invoices(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT,invoice_number TEXT,amount_pkr INTEGER,due_date TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE payments(id TEXT PRIMARY KEY,tenant_id TEXT,invoice_id TEXT,amount_pkr INTEGER,method TEXT,reference TEXT,received_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE sessions(id TEXT); CREATE TABLE support_tickets(id TEXT); CREATE TABLE audit_logs(id TEXT); CREATE TABLE billing_runs(id TEXT); CREATE TABLE user_permissions(id TEXT);");
  db.exec(readFileSync(new URL("../migrations/002_financial_management.sql",import.meta.url),"utf8"));
  db.exec("CREATE TABLE schema_migrations(version TEXT PRIMARY KEY)");
  db.exec("INSERT INTO tenants(id,name,slug) VALUES('t','Test','test')");
  db.exec("INSERT INTO users(id,tenant_id,email,password_hash,full_name) VALUES('u','t','a@b.c','x','Owner')");
  db.exec("INSERT INTO customers(id,tenant_id,customer_code,full_name) VALUES('c','t','C1','Customer')");
  db.exec("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,amount_pkr,due_date) VALUES('i','t','c','OLD-1',1000,'2000-01-01')");
  db.exec("INSERT INTO payments(id,tenant_id,invoice_id,amount_pkr,method) VALUES('p','t','i',400,'cash')");
  assert.equal(nextInvoiceNumber(db,"t","2026-11"),"INV-202611-000001");
  assert.equal(nextInvoiceNumber(db,"t","2026-11"),"INV-202611-000002");
  db.exec("INSERT INTO payment_reversals(id,tenant_id,payment_id,amount_pkr,reason,created_by) VALUES('r','t','p',100,'bank refund','u')");
  db.exec("INSERT INTO credit_notes(id,tenant_id,invoice_id,amount_pkr,reason,created_by) VALUES('n','t','i',200,'service adjustment','u')");
  const balance=invoiceBalance(db,"t","i");
  assert.equal(balance.balance,500);
  syncInvoiceStatus(db,"t","i");
  assert.equal(db.prepare("SELECT status FROM invoices WHERE id='i'").get().status,"overdue");
  assert.throws(()=>db.exec("DELETE FROM payment_reversals WHERE id='r'"),/append-only/);
  assert.throws(()=>db.exec("UPDATE credit_notes SET amount_pkr=1 WHERE id='n'"),/append-only/);
 }finally{db.close();}
});
