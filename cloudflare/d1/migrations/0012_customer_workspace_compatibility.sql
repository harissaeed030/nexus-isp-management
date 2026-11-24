-- NEXUS D1 migration 0012: customer workspace fields and tenant-scoped history.
-- Review schema_migrations before applying. Do not apply to production without an approved backup and release window.

ALTER TABLE customers ADD COLUMN account_number TEXT;
ALTER TABLE customers ADD COLUMN service_address TEXT;
ALTER TABLE customers ADD COLUMN coverage_area TEXT;
ALTER TABLE customers ADD COLUMN connection_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE customers ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';

UPDATE customers
SET account_number = COALESCE(NULLIF(account_number,''), customer_code),
    service_address = COALESCE(NULLIF(service_address,''), installation_address, address),
    account_status = CASE
      WHEN status = 'suspended' THEN 'blocked'
      WHEN status = 'terminated' THEN 'inactive'
      ELSE 'active'
    END
WHERE account_number IS NULL OR account_number = ''
   OR service_address IS NULL OR service_address = '';

CREATE INDEX IF NOT EXISTS idx_customers_org_account_number
  ON customers(organization_id, account_number);
CREATE INDEX IF NOT EXISTS idx_customers_org_account_status
  ON customers(organization_id, account_status);
CREATE INDEX IF NOT EXISTS idx_customers_org_connection_status
  ON customers(organization_id, connection_status);
CREATE INDEX IF NOT EXISTS idx_customers_org_coverage_area
  ON customers(organization_id, coverage_area);

CREATE TABLE IF NOT EXISTS customer_connection_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  notes TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subscription_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  notes TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_connection_history_org_customer
  ON customer_connection_history(organization_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_history_org_customer
  ON subscription_history(organization_id, customer_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_customer_connection_history_tenant_insert
BEFORE INSERT ON customer_connection_history BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers
    WHERE id = NEW.customer_id AND organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'customer connection history tenant mismatch') END;
  SELECT CASE WHEN NEW.actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = NEW.actor_user_id AND organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'customer connection history actor tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_subscription_history_tenant_insert
BEFORE INSERT ON subscription_history BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM subscriptions s
    JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
    WHERE s.id = NEW.subscription_id
      AND s.organization_id = NEW.organization_id
      AND s.customer_id = NEW.customer_id
  ) THEN RAISE(ABORT, 'subscription history tenant mismatch') END;
  SELECT CASE WHEN NEW.actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = NEW.actor_user_id AND organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'subscription history actor tenant mismatch') END;
END;

INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
VALUES (12, '0012_customer_workspace_compatibility', datetime('now'));
