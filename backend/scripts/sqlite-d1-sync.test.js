import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { registerSyncExportRoutes } from "../src/routes/sync-export.routes.js";

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

  let exportHandler;
  registerSyncExportRoutes({ get(_path, handler) { exportHandler = handler; } }, { db, env: { syncExportToken: "test-sync-token", syncTenantId: "" } });
  const response = {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    set(name,value) { this.headers[name] = value; return this; },
    json(value) { this.body = value; return this; }
  };
  exportHandler({ headers: { authorization: "Bearer test-sync-token" }, query: { after: "0", limit: "50" } }, response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.tenantId,tenant);
  assert.equal(response.body.count,5);
  assert.deepEqual(new Set(response.body.events.map(x=>x.entityType)),new Set(["customers","packages","subscriptions","invoices","payments"]));
  assert.ok(response.body.events.every(x=>x.record && !("password" in x.record) && !("password_hash" in x.record)));

  const before = db.prepare("SELECT MAX(cursor) AS n FROM sync_outbox WHERE tenant_id=?").get(tenant).n;
  db.prepare("UPDATE customers SET phone=? WHERE id=? AND tenant_id=?").run("03000000000",customer,tenant);
  const change = db.prepare("SELECT entity_type,entity_id,operation FROM sync_outbox WHERE tenant_id=? AND cursor>? ORDER BY cursor DESC LIMIT 1").get(tenant,before);
  assert.deepEqual({ ...change },{entity_type:"customers",entity_id:customer,operation:"upsert"});
  db.prepare("DELETE FROM sync_outbox WHERE tenant_id=?").run(tenant);
});


test("sync export pins the configured tenant and paginates without leaking other tenant records", () => {
  const tenantA=randomUUID(),tenantB=randomUUID(),customerA=randomUUID(),customerB=randomUUID();
  db.prepare("INSERT INTO tenants(id,name,slug) VALUES(?,?,?)").run(tenantA,"Tenant A","tenant-a-"+tenantA.slice(0,8));
  db.prepare("INSERT INTO tenants(id,name,slug) VALUES(?,?,?)").run(tenantB,"Tenant B","tenant-b-"+tenantB.slice(0,8));
  db.prepare("INSERT INTO customers(id,tenant_id,customer_code,full_name,status) VALUES(?,?,?,?,?)").run(customerA,tenantA,"A-001","Tenant A Customer","active");
  db.prepare("INSERT INTO packages(id,tenant_id,name,speed_down_mbps,speed_up_mbps,monthly_price_pkr) VALUES(?,?,?,?,?,?)").run(randomUUID(),tenantA,"Tenant A 10M",10,10,1000);
  db.prepare("INSERT INTO customers(id,tenant_id,customer_code,full_name,status) VALUES(?,?,?,?,?)").run(customerB,tenantB,"B-001","Tenant B Customer","active");
  let handler;
  registerSyncExportRoutes({get(_path,fn){handler=fn;}},{db,env:{syncExportToken:"pinned-token",syncTenantId:tenantA}});
  const invoke=query=>{
    const response={statusCode:200,body:null,headers:{},status(code){this.statusCode=code;return this;},set(name,value){this.headers[name]=value;return this;},json(value){this.body=value;return this;}};
    handler({headers:{authorization:"Bearer pinned-token"},query},response);
    return response;
  };
  const first=invoke({after:"0",limit:"1"});
  assert.equal(first.statusCode,200);
  assert.equal(first.body.tenantId,tenantA);
  assert.equal(first.body.count,1);
  assert.ok(first.body.events.every(event=>event.record?.tenant_id===tenantA));
  const second=invoke({after:String(first.body.nextCursor),limit:"1"});
  assert.equal(second.statusCode,200);
  assert.equal(second.body.count,1);
  assert.ok(second.body.nextCursor>first.body.nextCursor);
  assert.ok(second.body.events.every(event=>event.record?.tenant_id===tenantA));
  const invalid=invoke({after:"-1",limit:"1"});
  assert.equal(invalid.statusCode,400);
  const oversized=invoke({after:"0",limit:"101"});
  assert.equal(oversized.statusCode,400);
  db.prepare("DELETE FROM sync_outbox WHERE tenant_id IN (?,?)").run(tenantA,tenantB);
});

test.after(() => {
  try { db.close(); } catch {}
  rmSync(dir,{recursive:true,force:true});
});
