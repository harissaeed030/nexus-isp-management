-- Idempotent, tenant-scoped reminders for unpaid invoices.
CREATE TABLE IF NOT EXISTS notification_reminder_log(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
 event_key TEXT NOT NULL CHECK(event_key IN ('invoice_due','invoice_overdue')),
 outbox_id TEXT NOT NULL UNIQUE REFERENCES notification_outbox(id) ON DELETE RESTRICT,
 reminder_date TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,invoice_id,event_key)
);
CREATE INDEX IF NOT EXISTS idx_notification_reminder_log_tenant_date
 ON notification_reminder_log(tenant_id,reminder_date,event_key);
CREATE TRIGGER IF NOT EXISTS trg_notification_reminder_tenant_insert
 BEFORE INSERT ON notification_reminder_log BEGIN
  SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM invoices i JOIN notification_outbox n
    ON n.id=NEW.outbox_id AND n.tenant_id=i.tenant_id AND n.customer_id=i.customer_id
   WHERE i.id=NEW.invoice_id AND i.tenant_id=NEW.tenant_id
  ) THEN RAISE(ABORT,'notification reminder tenant or customer mismatch') END;
END;
