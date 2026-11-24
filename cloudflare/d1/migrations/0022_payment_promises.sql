-- NEXUS D1 migration 0022: tenant-scoped payment promises.
-- Compatible with the already-deployed legacy payment_promises table.
-- Migration 0025 adds updated_by after this base table exists.
-- Preflight: verify payment_promises is absent or has the base columns used below.

CREATE TABLE IF NOT EXISTS payment_promises (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount_pkr INTEGER NOT NULL CHECK(amount_pkr > 0),
  promise_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','kept','broken','cancelled')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
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

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(22,'0022_payment_promises',datetime('now'));
