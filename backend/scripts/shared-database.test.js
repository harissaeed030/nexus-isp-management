import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createD1Adapter, createSqliteAdapter, createTenantRepository, schemaFor } from "../../shared/database/index.js";

test("SQLite repository enforces tenant scope and optimistic updates", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE customers(
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_code TEXT NOT NULL,
    full_name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT,
    status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,customer_code)
  )`);
  const repo = createTenantRepository(createSqliteAdapter(db), schemaFor("sqlite"));
  await repo.create("customers","tenant-a",{customer_code:"C-1",full_name:"Customer One"},"customer-1");
  assert.equal((await repo.get("customers","tenant-a","customer-1")).full_name,"Customer One");
  assert.equal(await repo.get("customers","tenant-b","customer-1"),null);
  const current = await repo.get("customers","tenant-a","customer-1");
  const changed = await repo.update("customers","tenant-a","customer-1",{phone:"03000000000"},{expectedUpdatedAt:current.updated_at});
  assert.equal(changed.changes,1);
  const stale = await repo.update("customers","tenant-a","customer-1",{phone:"03000000001"},{expectedUpdatedAt:"2000-01-01"});
  assert.equal(stale.conflict,true);
  assert.equal((await repo.get("customers","tenant-a","customer-1")).phone,"03000000000");
  await assert.rejects(() => repo.get("customers","tenant-b","customer-1"));
  await assert.rejects(() => repo.update("customers","tenant-a","customer-1",{tenant_id:"tenant-b"}));
  await assert.rejects(() => repo.list("customers","tenant-a",{limit:501}));
  db.close();
});

test("SQLite adapter batch is atomic on failure", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE sample(id TEXT PRIMARY KEY)");
  const adapter = createSqliteAdapter(db);
  await assert.rejects(() => adapter.batch([
    {sql:"INSERT INTO sample(id) VALUES(?)",params:["one"]},
    {sql:"INSERT INTO missing_table(id) VALUES(?)",params:["two"]}
  ]));
  assert.equal((await adapter.first("SELECT COUNT(*) AS n FROM sample")).n,0);
  db.close();
});

test("D1 adapter uses bound parameters and returns normalized results", async () => {
  const calls = [];
  const binding = {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({sql,params});
          return {
            async first() { return {id:"record-1",organization_id:"org-1"}; },
            async all() { return {success:true,results:[{id:"record-1"}]}; },
            async run() { return {success:true,meta:{changes:1,last_row_id:4}}; }
          };
        }
      };
    },
    async batch(statements) { return statements.map(() => ({success:true,meta:{changes:1}})); }
  };
  const adapter = createD1Adapter(binding);
  assert.deepEqual(await adapter.first("SELECT * FROM customers WHERE id=? AND organization_id=?",["record-1","org-1"]),{id:"record-1",organization_id:"org-1"});
  assert.deepEqual(await adapter.all("SELECT * FROM customers WHERE organization_id=?",["org-1"]),[{id:"record-1"}]);
  assert.deepEqual(await adapter.run("UPDATE customers SET status=? WHERE id=?",["active","record-1"]),{changes:1,lastInsertRowid:4});
  assert.deepEqual(calls[0].params,["record-1","org-1"]);
  assert.equal(calls[0].sql.includes("org-1"),false);
  assert.equal((await adapter.batch([{sql:"UPDATE customers SET status=?",params:["active"]}])).length,1);
});

test("schema contract keeps the five synchronized entities mapped for both dialects", () => {
  const sqlite = schemaFor("sqlite"), d1 = schemaFor("d1");
  assert.deepEqual(Object.keys(sqlite),["customers","packages","subscriptions","invoices","payments"]);
  assert.equal(sqlite.customers.tenantColumn,"tenant_id");
  assert.equal(d1.customers.tenantColumn,"organization_id");
  assert.equal(sqlite.packages.table,d1.packages.table);
  assert.notEqual(sqlite.customers.columns.includes("full_name"),d1.customers.columns.includes("full_name"));
});
