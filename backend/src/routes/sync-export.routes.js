import { createHash, timingSafeEqual } from "node:crypto";

const MAX_BATCH = 100;
const SNAPSHOTS = {
  customers: "SELECT id,tenant_id,customer_code,full_name,phone,email,address,status,created_at,account_number,service_address,coverage_area,connection_status FROM customers WHERE id=? AND tenant_id=?",
  packages: "SELECT id,tenant_id,name,speed_down_mbps,speed_up_mbps,monthly_price_pkr,status,created_at FROM packages WHERE id=? AND tenant_id=?",
  subscriptions: "SELECT id,tenant_id,customer_id,package_id,status,started_at,expires_at,renewed_at,created_at FROM subscriptions WHERE id=? AND tenant_id=?",
  invoices: "SELECT id,tenant_id,customer_id,invoice_number,amount_pkr,due_date,status,created_at FROM invoices WHERE id=? AND tenant_id=?",
  payments: "SELECT id,tenant_id,invoice_id,amount_pkr,method,reference,received_at FROM payments WHERE id=? AND tenant_id=?"
};

function tokenMatches(candidate, expected) {
  if (!candidate || !expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function registerSyncExportRoutes(app, { db, env }) {
  app.get("/api/v1/sync/export", (req, res) => {
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!env.syncExportToken || !tokenMatches(bearer, env.syncExportToken)) {
      return res.status(401).json({ success: false, error: "Sync authentication failed." });
    }
    const tenantId = env.syncTenantId;
    if (!tenantId) return res.status(503).json({ success: false, error: "SYNC_TENANT_ID is not configured." });
    const after = Number.parseInt(req.query.after || "0", 10);
    const limit = Number.parseInt(req.query.limit || "50", 10);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) {
      return res.status(400).json({ success: false, error: "Use after >= 0 and limit between 1 and 100." });
    }
    const events = db.prepare("SELECT cursor,operation_id,entity_type,entity_id,operation,created_at FROM sync_outbox WHERE tenant_id=? AND cursor>? ORDER BY cursor ASC LIMIT ?").all(tenantId, after, limit);
    const data = events.map(event => {
      const statement = SNAPSHOTS[event.entity_type];
      if (!statement) throw new Error("Unsupported sync entity type.");
      const record = event.operation === "upsert" ? db.prepare(statement).get(event.entity_id, tenantId) : null;
      return {
        cursor: event.cursor,
        operationId: event.operation_id,
        entityType: event.entity_type,
        entityId: event.entity_id,
        operation: record ? "upsert" : "delete",
        changedAt: event.created_at,
        record: record || null
      };
    });
    const nextCursor = data.length ? data[data.length - 1].cursor : after;
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res.json({ success: true, tenantId, after, nextCursor, count: data.length, events: data });
  });
}
