-- D1 migration 0007: customer portal accounts and tenant integrity guards.
-- Additive and idempotent. Requires the existing NEXUS schema (migrations 0001-0006).
CREATE TABLE IF NOT EXISTS customer_portal_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  UNIQUE(organization_id,email),
  UNIQUE(organization_id,customer_id),
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_d1_portal_org_i
BEFORE INSERT ON customer_portal_accounts
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM customers
      WHERE id=NEW.customer_id AND organization_id=NEW.organization_id
    )
    THEN RAISE(ABORT,'portal account customer organization mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_portal_org_u
BEFORE UPDATE OF organization_id,customer_id ON customer_portal_accounts
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM customers
      WHERE id=NEW.customer_id AND organization_id=NEW.organization_id
    )
    THEN RAISE(ABORT,'portal account customer organization mismatch')
  END;
END;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(7,'0007_customer_portal_tenant_guards',datetime('now'));
