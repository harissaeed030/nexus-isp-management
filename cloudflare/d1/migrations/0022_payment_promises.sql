-- D1 migration 0022: tenant-scoped payment promises for the hosted billing module.
-- Additive and idempotent. Does not rewrite customers, invoices, payments or users.
-- Run only after fresh production/staging exports and a live preflight confirming
-- that payment_promises and these indexes/triggers are absent in the target D1 DB.

CREATE TABLE IF NOT EXISTS payment_promises (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount_pkr INTEGER NOT NULL CHECK(amount_pkr > 0),
  promise_date TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','kept','broken','cancelled')),
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_promises_org_status_date
  ON payment_promises(organization_id,status,promise_date);
CREATE INDEX IF NOT EXISTS idx_payment_promises_org_customer
  ON payment_promises(organization_id,customer_id);

CREATE TRIGGER IF NOT EXISTS trg_payment_promise_org_i
BEFORE INSERT ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise creator organization mismatch') END;
END;

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
VALUES(22,'0022_payment_promises',datetime('now'));
