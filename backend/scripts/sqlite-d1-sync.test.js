import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dir = mkdtempSync(join(tmpdir(), "nexus-sync-test-"));
process.env.SQLITE_PATH = join(dir, "test.sqlite");
const { db } = await import("../src/config/database.js");

test("sync outbox records all five business entities and changes", () => {
  const tenant = randomUUID(), customer = randomUUID(), pkg = randomUUID();
  const subscription = randomUUID(), invoice = randomUUID(), payment = randomUUID();
  db.prepare("INSERT INTO tenants(id,name,slug) VALUES(?,?,?)").run(tenant,"Sync Test","sync-"+tenant.slice(0,8));
  db.prepare("INSERT INTO customers(id,tenant_id,customer_code,full_name,status) VALUES(?,?,?,?,?)").run(customer,tenant,"C-001","Test Customer","active");
  db.prepare("INSERT INTO packages(id,tenant_id,name,speed_down_mbps,speed_up_mbps,monthly_price_pkr) VALUES(?,?,?,?,?,?)").run(pkg,tenant,"10 Mbps",10,10,1000);
  db.prepare("INSERT INTO subscriptions(id,tenant_id,customer_id,package_id,status,started_at) VALUES(?,?,?,?,?,?)").run(subscription,tenant,customer,pkg,"active","2026-11-01");
  db.prepare("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,amount_pkr,due_date) VALUES(?,?,?,?,?,?)").run(invoice,tenant,customer,"INV-SYNC-001",1000,"2026-11-30");
  db.prepare("INSERT INTO payments(id,tenant_id,invoice_id,amount_pkr,method) VALUES(?,?,?,?,?)").run(payment,tenant,invoice,500,"cash");

  const initial = db.prepare("SELECT entity_type,COUNT(*) AS n FROM sync_outbox WHERE tenant_id=? GROUP BY entity_type").all(tenant);
  assert.deepEqual(new Set(initial.map(x=>x.entity_type)),new Set(["customers","packages","subscriptions","invoices","payments"]));
  assert.equal(initial.reduce((sum,x)=>sum+x.n,0),5);

  const before = db.prepare("SELECT MAX(cursor) AS n FROM sync_outbox WHERE tenant_id=?").get(tenant).n;
  db.prepare("UPDATE customers SET phone=? WHERE id=? AND tenant_id=?").run("03000000000",customer,tenant);
  const change = db.prepare("SELECT entity_type,entity_id,operation FROM sync_outbox WHERE tenant_id=? AND cursor>? ORDER BY cursor DESC LIMIT 1").get(tenant,before);
  assert.deepEqual(change,{entity_type:"customers",entity_id:customer,operation:"upsert"});
  db.prepare("DELETE FROM sync_outbox WHERE tenant_id=?").run(tenant);
});

test.after(() => {
  try { db.close(); } catch {}
  rmSync(dir,{recursive:true,force:true});
});
