-- NEXUS D1 migration 0025: complete payment-promise tenant audit metadata.
-- Migration 0022 deliberately creates the common base table without updated_by;
-- this additive migration adds the field before the Worker exposes promise edits.
-- Apply once after migration 0022.

ALTER TABLE payment_promises ADD COLUMN updated_by TEXT;

CREATE TRIGGER IF NOT EXISTS trg_payment_promise_org_u
BEFORE UPDATE OF organization_id,customer_id,created_by,updated_by ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise creator organization mismatch') END;
 SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise updater organization mismatch') END;
END;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(25,'0025_payment_promises_updated_by_guard',datetime('now'));
