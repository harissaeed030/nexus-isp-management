import test from "node:test";
import assert from "node:assert/strict";
import { assertSyncRecordOwnership, getTenantMapping, normalizeCustomerSyncFields, validateSyncBatch } from "../src/sync-worker.js";

test("sync batches require a tenant and one to fifty events", () => {
  assert.match(validateSyncBatch("", [{ cursor: 1, operationId: "a" }]), /sourceTenantId/);
  assert.match(validateSyncBatch("tenant-a", []), /1-50 events/);
  assert.equal(validateSyncBatch("tenant-a", [{ cursor: 1, operationId: "a" }]), null);
});

test("sync batches require strictly increasing cursors but permit global cursor gaps", () => {
  assert.equal(validateSyncBatch("tenant-a", [
    { cursor: 2, operationId: "a" },
    { cursor: 9, operationId: "b" }
  ]), null);
  assert.match(validateSyncBatch("tenant-a", [
    { cursor: 9, operationId: "b" },
    { cursor: 2, operationId: "a" }
  ]), /strictly increasing/);
  assert.match(validateSyncBatch("tenant-a", [
    { cursor: 2, operationId: "a" },
    { cursor: 2, operationId: "b" }
  ]), /strictly increasing/);
});

test("sync batches reject missing or repeated idempotency keys", () => {
  assert.match(validateSyncBatch("tenant-a", [{ cursor: 1 }]), /unique operationId/);
  assert.match(validateSyncBatch("tenant-a", [
    { cursor: 1, operationId: "same" },
    { cursor: 2, operationId: "same" }
  ]), /unique operationId/);
});

test("sync tenant mapping must already be explicitly provisioned", async () => {
  let selected = 0;
  const database = {
    prepare(sql) {
      assert.match(sql, /SELECT organization_id FROM sync_tenant_mappings/);
      return {
        bind(sourceTenantId) {
          assert.equal(sourceTenantId, "local-tenant-1");
          return {
            async first() {
              selected += 1;
              return null;
            }
          };
        }
      };
    }
  };
  assert.equal(await getTenantMapping(database, "local-tenant-1"), null);
  assert.equal(selected, 1);
});

test("sync tenant mapping returns only an active mapping", async () => {
  const database = {
    prepare() {
      return {
        bind(sourceTenantId) {
          assert.equal(sourceTenantId, "local-tenant-2");
          return { async first() { return { organization_id: "vancom-org-id" }; } };
        }
      };
    }
  };
  assert.deepEqual(await getTenantMapping(database, "local-tenant-2"), { organization_id: "vancom-org-id" });
});

test("customer sync preserves account and connection status across SQLite and D1 schemas", () => {
  assert.deepEqual(normalizeCustomerSyncFields({status:"active",connection_status:"active"}), {
    status:"active",accountStatus:"active",connectionStatus:"active"
  });
  assert.deepEqual(normalizeCustomerSyncFields({status:"blocked",connection_status:"suspended"}), {
    status:"suspended",accountStatus:"blocked",connectionStatus:"suspended"
  });
  assert.deepEqual(normalizeCustomerSyncFields({status:"inactive",connection_status:"disconnected"}), {
    status:"terminated",accountStatus:"inactive",connectionStatus:"disconnected"
  });
  assert.deepEqual(normalizeCustomerSyncFields({status:"unexpected",connection_status:"unknown"}), {
    status:"active",accountStatus:"active",connectionStatus:"pending"
  });
});

test("sync rejects a record primary key owned by another organization", async () => {
  let sqlSeen = "";
  const database = {
    prepare(sql) {
      sqlSeen = sql;
      return {
        bind(id) {
          assert.equal(id, "shared-record-id");
          return { async first() { return { organization_id: "other-org" }; } };
        }
      };
    }
  };
  await assert.rejects(
    assertSyncRecordOwnership(database, "customers", "target-org", "shared-record-id"),
    /belongs to another organization/
  );
  assert.match(sqlSeen, /FROM customers WHERE id=\?/);
});

test("sync ownership check accepts absent IDs and rejects unsupported tables", async () => {
  const database = { prepare() { return { bind() { return { async first() { return null; } }; } }; } };
  assert.equal(await assertSyncRecordOwnership(database, "invoices", "target-org", "new-id"), false);
  await assert.rejects(assertSyncRecordOwnership(database, "users", "target-org", "id"), /Unsupported sync entity/);
});

test("sync HTTP endpoint rejects unauthenticated, oversized, malformed, and unmapped pushes safely", async () => {
  const { default: worker } = await import("../src/sync-worker.js");
  const unauth = await worker.fetch(new Request("https://sync.example/sync/push",{method:"POST",body:"{}"}),{SYNC_PUSH_TOKEN:"secret",DB:{}});
  assert.equal(unauth.status,401);
  const missingDb = await worker.fetch(new Request("https://sync.example/sync/push",{method:"POST",headers:{Authorization:"Bearer secret"},body:"{}"}),{SYNC_PUSH_TOKEN:"secret"});
  assert.equal(missingDb.status,503);
  const badJson = await worker.fetch(new Request("https://sync.example/sync/push",{method:"POST",headers:{Authorization:"Bearer secret"},body:"{"}),{SYNC_PUSH_TOKEN:"secret",DB:{}});
  assert.equal(badJson.status,400);
  const oversized = await worker.fetch(new Request("https://sync.example/sync/push",{method:"POST",headers:{Authorization:"Bearer secret"},body:"x".repeat(900001)}),{SYNC_PUSH_TOKEN:"secret",DB:{}});
  assert.equal(oversized.status,413);
  let mappingQuery="";
  const DB={prepare(sql){mappingQuery=sql;return{bind(source){assert.equal(source,"local-tenant");return{async first(){return null;}};}};}};
  const unmapped = await worker.fetch(new Request("https://sync.example/sync/push",{method:"POST",headers:{Authorization:"Bearer secret","Content-Type":"application/json"},body:JSON.stringify({sourceTenantId:"local-tenant",events:[{cursor:1,operationId:"op-1"}]})}),{SYNC_PUSH_TOKEN:"secret",DB});
  assert.equal(unmapped.status,409);
  assert.match(mappingQuery,/sync_tenant_mappings/);
  assert.match(mappingQuery,/active=1/);
  assert.match(await unmapped.text(),/No approved SQLite tenant mapping/);
});

test("sync endpoint reports health without exposing configuration secrets", async () => {
  const { default: worker } = await import("../src/sync-worker.js");
  const response=await worker.fetch(new Request("https://sync.example/health"),{DB:{}});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body,{success:true,service:"NEXUS SQLite-to-D1 sync",database:"configured"});
  assert.doesNotMatch(JSON.stringify(body),/secret|token|password/i);
});
