-- NEXUS D1 migration 0023: tenant-scoped payment promises.
-- Live production/staging ledgers already use IDs 10-21 for other migrations.
-- ID 22 is security hardening; 23 is the next unused shared migration ID.
-- Additive only; no existing business rows are modified.
CREATE TABLE IF NOT EXISTS payment_promises (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  amount          INTEGER NOT NULL CHECK(amount > 0),
  promise_date    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','kept','broken','cancelled')),
  notes           TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_payment_promises_org_date
  ON payment_promises(organization_id, promise_date, status);
CREATE TRIGGER IF NOT EXISTS trg_payment_promises_customer_tenant_insert
 BEFORE INSERT ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM customers
  WHERE id=NEW.customer_id AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise customer tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_payment_promises_creator_tenant_insert
 BEFORE INSERT ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users
  WHERE id=NEW.created_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise creator tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_payment_promises_tenant_update
 BEFORE UPDATE OF organization_id,customer_id,created_by ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM customers
  WHERE id=NEW.customer_id AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise customer tenant mismatch') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users
  WHERE id=NEW.created_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise creator tenant mismatch') END;
END;
INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(23,'0023_payment_promises',datetime('now'));
