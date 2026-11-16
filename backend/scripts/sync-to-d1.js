import { db } from "../src/config/database.js";
import { env } from "../src/config/env.js";

const exportUrl = `http://127.0.0.1:${env.port}/api/v1/sync/export`;
const workerUrl = env.syncWorkerUrl;
const workerToken = env.syncWorkerToken;
if (!env.syncExportToken) throw new Error("Set SYNC_EXPORT_TOKEN in backend/.env first.");
if (!workerUrl || !workerToken) throw new Error("Set D1_SYNC_WORKER_URL and D1_SYNC_WORKER_TOKEN in backend/.env first.");

const state = db.prepare("SELECT state_value FROM sync_state WHERE state_key='d1_cursor'").get();
let cursor = Number(state?.state_value || 0);
let batches = 0, sent = 0;
while (batches < 100) {
  const sourceResponse = await fetch(`${exportUrl}?after=${cursor}&limit=50`, {
    headers: { Authorization: `Bearer ${env.syncExportToken}`, Accept: "application/json" }
  });
  const source = await sourceResponse.json().catch(() => null);
  if (!sourceResponse.ok || !source?.success) throw new Error(source?.error || `SQLite export failed: HTTP ${sourceResponse.status}`);
  if (!Array.isArray(source.events) || source.events.length === 0) break;

  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sourceTenantId: source.tenantId, events: source.events })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error || `D1 sync failed: HTTP ${response.status}`);
  const acknowledged = Number(result.ackCursor);
  if (!Number.isSafeInteger(acknowledged) || acknowledged < cursor || acknowledged > source.nextCursor) {
    throw new Error("Worker returned an invalid acknowledgement cursor; local cursor was not advanced.");
  }
  cursor = acknowledged;
  db.prepare("INSERT INTO sync_state(state_key,state_value,updated_at) VALUES('d1_cursor',?,CURRENT_TIMESTAMP) ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=CURRENT_TIMESTAMP").run(String(cursor));
  sent += Number(result.applied || 0);
  batches += 1;
  if (source.events.length < 50) break;
}
process.stdout.write(JSON.stringify({ success: true, batches, applied: sent, cursor }) + "\n");
