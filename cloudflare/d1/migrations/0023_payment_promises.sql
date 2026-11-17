-- NEXUS D1 migration 0023: tenant-scoped payment promises.
-- Live production and staging ledgers already use ID 10 for
-- 0010_pppoe_connection_metadata. IDs 11-21 are also assigned in staging,
-- ID 22 is security hardening on this development branch. Do not reuse them.
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
INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(23,'0023_payment_promises',datetime('now'));
