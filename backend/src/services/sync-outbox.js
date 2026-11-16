import { createOperation } from "../../../shared/sync-contract/v1.js";

const MAX_ATTEMPTS = 12;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

function isoAfter(ms) { return new Date(Date.now() + ms).toISOString(); }
function retryDelay(attempt) {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)));
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

/** Claim a bounded batch under an immediate transaction; expired leases are reclaimable. */
export function claimOutboxBatch(db, { limit = 25, leaseMs = 60_000 } = {}) {
  const size = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 25));
  const now = new Date().toISOString();
  const leaseUntil = isoAfter(leaseMs);
  db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db.prepare(`
      SELECT * FROM sync_outbox
      WHERE (state='pending' AND next_attempt_at<=?)
         OR (state='inflight' AND lease_until<=?)
      ORDER BY sequence LIMIT ?
    `).all(now, now, size);
    const update = db.prepare(`
      UPDATE sync_outbox SET state='inflight', lease_until=?, attempts=attempts+1,
        updated_at=? WHERE sequence=? AND
        ((state='pending' AND next_attempt_at<=?) OR (state='inflight' AND lease_until<=?))
    `);
    const claimed = [];
    for (const row of rows) {
      const result = update.run(leaseUntil, now, row.sequence, now, now);
      if (Number(result.changes) === 1) claimed.push({ ...row, attempts: row.attempts + 1, state: 'inflight', lease_until: leaseUntil });
    }
    db.exec("COMMIT");
    return claimed;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Validate the stored event again at the trust boundary before network transmission. */
export function toSyncOperations(rows, organizationIdForTenant) {
  return rows.map(row => createOperation({
    operationId: row.operation_id,
    tenantId: row.tenant_id,
    entity: row.entity,
    record: JSON.parse(row.payload_json),
    organizationId: organizationIdForTenant(row.tenant_id),
    operation: row.operation
  }));
}

export function markOutboxSynced(db, operationIds) {
  const now = new Date().toISOString();
  const update = db.prepare("UPDATE sync_outbox SET state='synced', synced_at=?, updated_at=?, lease_until=NULL, last_error_code=NULL WHERE operation_id=? AND state='inflight'");
  db.exec("BEGIN IMMEDIATE");
  try { for (const id of operationIds) update.run(now, now, id); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function markOutboxFailed(db, operationId, errorCode, { permanent = false } = {}) {
  const row = db.prepare("SELECT attempts FROM sync_outbox WHERE operation_id=? AND state='inflight'").get(operationId);
  if (!row) return false;
  const quarantine = permanent || row.attempts >= MAX_ATTEMPTS;
  const next = quarantine ? null : isoAfter(retryDelay(row.attempts));
  db.prepare(`
    UPDATE sync_outbox SET state=?, next_attempt_at=COALESCE(?, next_attempt_at),
      lease_until=NULL, last_error_code=?, updated_at=? WHERE operation_id=? AND state='inflight'
  `).run(quarantine ? 'quarantined' : 'pending', next, String(errorCode || 'SYNC_FAILED').slice(0, 80), new Date().toISOString(), operationId);
  return true;
}

export function requeueQuarantined(db, operationId) {
  const result = db.prepare("UPDATE sync_outbox SET state='pending', attempts=0, next_attempt_at=?, lease_until=NULL, last_error_code=NULL, updated_at=? WHERE operation_id=? AND state='quarantined'")
    .run(new Date().toISOString(), new Date().toISOString(), operationId);
  return Number(result.changes) === 1;
}
