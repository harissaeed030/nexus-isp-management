import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runCollectionReminderCycle } from "../src/services/collection-reminder-scheduler.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE tenants(id TEXT PRIMARY KEY);
    CREATE TABLE customers(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,full_name TEXT,phone TEXT,email TEXT,account_number TEXT,customer_code TEXT,status TEXT DEFAULT 'active');
    CREATE TABLE invoices(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,customer_id TEXT NOT NULL,invoice_number TEXT,amount_pkr INTEGER NOT NULL,due_date TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE payments(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,invoice_id TEXT NOT NULL,amount_pkr INTEGER NOT NULL);
    CREATE TABLE payment_reversals(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,payment_id TEXT NOT NULL,amount_pkr INTEGER NOT NULL);
    CREATE TABLE credit_notes(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,invoice_id TEXT NOT NULL,amount_pkr INTEGER NOT NULL);
    CREATE TABLE payment_promises(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,customer_id TEXT NOT NULL,amount_pkr INTEGER NOT NULL,promise_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',notes TEXT,created_by TEXT);
    CREATE TABLE notification_templates(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT,event_key TEXT,channel TEXT,body TEXT,provider_template_name TEXT,language_code TEXT,enabled INTEGER);
    CREATE TABLE notification_outbox(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,customer_id TEXT,template_id TEXT,channel TEXT,destination TEXT,body TEXT,
      provider_template_name TEXT,language_code TEXT,template_parameters TEXT,status TEXT,next_attempt_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(readFileSync(new URL("../migrations/016_collection_reminder_idempotency.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../migrations/017_payment_promise_reminder_idempotency.sql", import.meta.url), "utf8"));
  db.exec("INSERT INTO tenants(id) VALUES('t1')");
  db.exec("INSERT INTO customers(id,tenant_id,full_name,phone,email,account_number,status) VALUES('c1','t1','A Customer','+923001112233','a@example.test','VAN-001','active'),('c2','t1','No Phone',NULL,NULL,'VAN-002','active')");
  db.exec("INSERT INTO notification_templates(id,tenant_id,name,event_key,channel,body,provider_template_name,language_code,enabled) VALUES('td','t1','Due reminder','invoice_due','whatsapp','Salam {{name}}, invoice {{invoiceNumber}} due {{dueDate}}. Outstanding PKR {{amount}}.','approved_due','en_US',1),('to','t1','Overdue reminder','invoice_overdue','whatsapp','{{name}}: invoice {{invoiceNumber}} is overdue. PKR {{amount}}.','approved_overdue','en_US',1),('tp','t1','Promise reminder','payment_promise_due','whatsapp','{{name}}, your promised payment of PKR {{amount}} is due {{dueDate}}.','approved_promise','en_US',1)");
  db.exec("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,amount_pkr,due_date) VALUES('i-due','t1','c1','INV-DUE',1200,'2026-11-24'),('i-overdue','t1','c1','INV-OLD',1500,'2026-11-20'),('i-paid','t1','c1','INV-PAID',1000,'2026-11-20'),('i-no-phone','t1','c2','INV-NOPHONE',500,'2026-11-20')");
  db.exec("INSERT INTO payments(id,tenant_id,invoice_id,amount_pkr) VALUES('p1','t1','i-paid',1000)");
  db.exec("INSERT INTO payment_promises(id,tenant_id,customer_id,amount_pkr,promise_date,status) VALUES('promise-open','t1','c1',900,'2026-11-24','open'),('promise-kept','t1','c1',500,'2026-11-24','kept')");
  return db;
}

test("queues due, overdue and payment-promise reminders once; skips paid invoices and phone-less customers", () => {
  const db = fixture();
  const now = new Date("2026-11-24T07:00:00.000Z");
  const first = runCollectionReminderCycle({ db, now, logger: { error() {} } });
  assert.deepEqual({ examined:first.examined,queued:first.queued }, { examined:6,queued:3 });
  const rows = db.prepare("SELECT customer_id,body,status,provider_template_name FROM notification_outbox ORDER BY id").all();
  assert.equal(rows.length,3);
  assert.ok(rows.every(row => row.status === "queued"));
  assert.ok(rows.some(row => row.body.includes("INV-DUE") && row.body.includes("1200")));
  assert.ok(rows.some(row => row.body.includes("INV-OLD") && row.body.includes("1500")));
  assert.ok(rows.some(row => row.body.includes("promised payment of PKR 900")));
  const again = runCollectionReminderCycle({ db, now, logger: { error() {} } });
  assert.equal(again.queued,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_reminder_log").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM payment_promise_reminder_log").get().n,1);
  db.close();
});

test("does not create reminder markers when the required enabled template is missing", () => {
  const db = fixture();
  db.exec("DELETE FROM notification_templates WHERE event_key IN ('invoice_overdue','payment_promise_due')");
  const result = runCollectionReminderCycle({ db, now:new Date("2026-11-24T07:00:00.000Z"), logger:{error(){}} });
  assert.equal(result.queued,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_reminder_log WHERE event_key='invoice_overdue'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM payment_promise_reminder_log").get().n,0);
  db.close();
});
