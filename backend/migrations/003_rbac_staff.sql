-- Migration 003: granular RBAC, staff account fields, role permissions and staff activity logs.
-- Safe for existing 0.2.0 databases: additive tables/columns/indexes only; no rows dropped or rewritten.
-- Runs once under the schema_migrations ledger; every statement is repeatable by design (IF NOT EXISTS).

-- Permission catalog (single source of truth is seeded by src/lib/permissions.js at boot).
CREATE TABLE IF NOT EXISTS permissions(
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  label TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- System roles are tenant-independent (tenant_id NULL); custom roles belong to one tenant.
CREATE TABLE IF NOT EXISTS roles(
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,key)
);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id,key);

-- Per-role permission grants. allowed=0 is an explicit deny that wins over inheritance.
CREATE TABLE IF NOT EXISTS role_permissions(
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id,permission)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission);

-- Staff account fields.
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN last_login_ip TEXT;
ALTER TABLE users ADD COLUMN suspended_at TEXT;
ALTER TABLE users ADD COLUMN suspended_by TEXT REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_tenant ON users(tenant_id,username);
CREATE INDEX IF NOT EXISTS idx_users_tenant_status ON users(tenant_id,status);

-- Emails are unique per tenant, not globally: the previous global index blocked
-- two tenants from independently using the same owner email.
DROP INDEX IF EXISTS idx_users_email_global;

-- Staff activity log enrichment (audit_logs is the staff activity store).
ALTER TABLE audit_logs ADD COLUMN target_user_id TEXT;
ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;
ALTER TABLE audit_logs ADD COLUMN metadata TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(tenant_id,actor_user_id,created_at);
CREATE VIEW IF NOT EXISTS staff_activity_logs AS
SELECT id,tenant_id,actor_user_id,action,resource_type,resource_id,target_user_id,ip_address,metadata,created_at
FROM audit_logs
WHERE action LIKE 'staff.%' OR action LIKE 'auth.%' OR action LIKE 'role.%' OR action LIKE 'permission.%'
   OR action='authorization.denied';

-- Financial transaction hardening.
ALTER TABLE invoices ADD COLUMN approved_at TEXT;
ALTER TABLE invoices ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE payments ADD COLUMN reversed_at TEXT;
ALTER TABLE payments ADD COLUMN reversed_by TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_payments_reversed ON payments(tenant_id,reversed_at);

-- Installations.
CREATE TABLE IF NOT EXISTS installations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','in_progress','completed','cancelled')),
  technician_id TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_installations_tenant ON installations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(tenant_id,status);

-- Renewals.
CREATE TABLE IF NOT EXISTS renewals(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount_pkr INTEGER NOT NULL DEFAULT 0,
  renews_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_renewals_tenant ON renewals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_renewals_status ON renewals(tenant_id,status);

-- Expenses.
CREATE TABLE IF NOT EXISTS expenses(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT,
  amount_pkr INTEGER NOT NULL,
  expense_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(tenant_id,status);

-- OLT/ONU inventory.
CREATE TABLE IF NOT EXISTS olt_onus(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('olt','onu')),
  serial_number TEXT,
  ip_address TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','maintenance')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,serial_number)
);
CREATE INDEX IF NOT EXISTS idx_olt_onus_tenant ON olt_onus(tenant_id);
CREATE INDEX IF NOT EXISTS idx_olt_onus_type ON olt_onus(tenant_id,type);

-- Tenant-consistency guards for the new module tables.
CREATE TRIGGER IF NOT EXISTS trg_installations_tenant_insert
BEFORE INSERT ON installations BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'installation subscription tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'installation customer tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_installations_tenant_update
BEFORE UPDATE OF tenant_id,subscription_id,customer_id ON installations BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'installation subscription tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'installation customer tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_renewals_tenant_insert
BEFORE INSERT ON renewals BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'renewal subscription tenant mismatch') END;
  SELECT CASE WHEN NEW.amount_pkr < 0 THEN RAISE(ABORT,'renewal amount must be non-negative') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_renewals_tenant_update
BEFORE UPDATE OF tenant_id,subscription_id,amount_pkr ON renewals BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'renewal subscription tenant mismatch') END;
  SELECT CASE WHEN NEW.amount_pkr < 0 THEN RAISE(ABORT,'renewal amount must be non-negative') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_expenses_tenant_insert
BEFORE INSERT ON expenses BEGIN
  SELECT CASE WHEN NEW.amount_pkr < 1 THEN RAISE(ABORT,'expense amount must be positive') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_expenses_tenant_update
BEFORE UPDATE OF tenant_id,amount_pkr ON expenses BEGIN
  SELECT CASE WHEN NEW.amount_pkr < 1 THEN RAISE(ABORT,'expense amount must be positive') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_olt_onus_tenant_insert
BEFORE INSERT ON olt_onus BEGIN
  SELECT CASE WHEN NEW.tenant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tenants WHERE id=NEW.tenant_id)
    THEN RAISE(ABORT,'olt/onu tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_olt_onus_tenant_update
BEFORE UPDATE OF tenant_id ON olt_onus BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tenants WHERE id=NEW.tenant_id)
    THEN RAISE(ABORT,'olt/onu tenant mismatch') END;
END;
