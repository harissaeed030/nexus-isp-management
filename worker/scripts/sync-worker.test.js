import test from "node:test";
import assert from "node:assert/strict";
import { getTenantMapping, normalizeCustomerSyncFields, validateSyncBatch } from "../src/sync-worker.js";

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
