-- Idempotent, tenant-scoped reminders for open payment promises.
CREATE TABLE IF NOT EXISTS payment_promise_reminder_log(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 promise_id TEXT NOT NULL REFERENCES payment_promises(id) ON DELETE CASCADE,
 outbox_id TEXT NOT NULL UNIQUE REFERENCES notification_outbox(id) ON DELETE RESTRICT,
 reminder_date TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,promise_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_promise_reminder_log_tenant_date
 ON payment_promise_reminder_log(tenant_id,reminder_date);
CREATE TRIGGER IF NOT EXISTS trg_payment_promise_reminder_tenant_insert
 BEFORE INSERT ON payment_promise_reminder_log BEGIN
  SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM payment_promises p JOIN notification_outbox n
    ON n.id=NEW.outbox_id AND n.tenant_id=p.tenant_id AND n.customer_id=p.customer_id
   WHERE p.id=NEW.promise_id AND p.tenant_id=NEW.tenant_id
  ) THEN RAISE(ABORT,'payment promise reminder tenant or customer mismatch') END;
END;
