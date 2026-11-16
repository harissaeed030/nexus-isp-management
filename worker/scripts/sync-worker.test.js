import test from "node:test";
import assert from "node:assert/strict";
import { validateSyncBatch } from "../src/sync-worker.js";

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
