PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A login email is globally unique. This avoids ambiguous cross-tenant login.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'billing', 'noc', 'support', 'super_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_pkr INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price_pkr >= 0),
  max_customers INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'suspended')),
  trial_ends_at TEXT,
  current_period_ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  tenant_id TEXT,
  action TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON tenant_subscriptions(status);

INSERT OR IGNORE INTO plans (code, name, monthly_price_pkr, max_customers) VALUES
  ('trial', '14-day Trial', 0, 50),
  ('basic', 'Basic', 1500, 250),
  ('professional', 'Professional', 3000, 1000),
  ('enterprise', 'Enterprise', 0, NULL);
