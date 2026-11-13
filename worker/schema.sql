-- NEXUS Cloudflare D1 schema snapshot; captured from the existing production database.
-- Source-only reference. Never execute this snapshot against production as an initialization script.
PRAGMA foreign_keys = ON;

CREATE TABLE api_keys (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  label           TEXT,
  last_used_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT,
  user_id         TEXT,
  action          TEXT NOT NULL,
  detail          TEXT,
  ip_address      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE customers (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','terminated')),
  customer_code   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')), balance REAL DEFAULT 0, notes TEXT, installation_address TEXT, installation_date TEXT, id_type TEXT, id_number TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE login_attempts (
        id TEXT PRIMARY KEY,
        ip_address TEXT NOT NULL,
        email TEXT NOT NULL,
        attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

CREATE TABLE network_devices (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        device_type TEXT NOT NULL CHECK(device_type IN ('mikrotik','olt','acs','other')),
        host TEXT,
        port INTEGER,
        username TEXT,
        status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','maintenance')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      );

CREATE TABLE notifications (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id         TEXT,
      title           TEXT NOT NULL,
      message         TEXT,
      type            TEXT DEFAULT 'info',
      is_read         INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE organizations (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, email TEXT, phone TEXT, address TEXT, currency TEXT DEFAULT 'USD', logo TEXT);

CREATE TABLE packages (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  speed_mbps      INTEGER NOT NULL,
  price           REAL NOT NULL,
  billing_cycle   TEXT NOT NULL DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','quarterly','yearly')),
  data_limit_gb   INTEGER,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')), speed_down TEXT, speed_up TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE password_resets (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE payments (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  invoice_id      TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  amount          REAL NOT NULL,
  payment_method  TEXT CHECK(payment_method IN ('cash','bank_transfer','card','mobile_money','other')),
  transaction_ref TEXT,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','failed','refunded')),
  paid_at         TEXT NOT NULL DEFAULT (datetime('now')),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id)      REFERENCES invoices(id)    ON DELETE CASCADE,
  FOREIGN KEY (customer_id)     REFERENCES customers(id)    ON DELETE CASCADE
);

CREATE TABLE pppoe_accounts (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      customer_id     TEXT NOT NULL,
      username        TEXT NOT NULL,
      password        TEXT NOT NULL,
      ip_address      TEXT,
      status          TEXT DEFAULT 'active',
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      UNIQUE (organization_id, username),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

CREATE TABLE schema_migrations (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE settings (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      key             TEXT NOT NULL,
      value           TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      UNIQUE (organization_id, key),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

CREATE TABLE subscriptions (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  package_id      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','cancelled','expired')),
  start_date      TEXT NOT NULL,
  end_date        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')), auto_renew INTEGER DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id)     REFERENCES customers(id)  ON DELETE CASCADE,
  FOREIGN KEY (package_id)      REFERENCES packages(id)   ON DELETE CASCADE
);

CREATE TABLE support_tickets (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  customer_id     TEXT,
  subject         TEXT NOT NULL,
  description     TEXT,
  priority        TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
  assigned_to     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')), resolution TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id)     REFERENCES customers(id)     ON DELETE SET NULL,
  FOREIGN KEY (assigned_to)     REFERENCES users(id)         ON DELETE SET NULL
);

CREATE TABLE ticket_messages (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  ticket_id       TEXT NOT NULL,
  user_id         TEXT,
  message         TEXT NOT NULL,
  is_staff        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)            ON DELETE SET NULL
);

CREATE TABLE users (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')), name TEXT, phone TEXT, status TEXT DEFAULT 'active', avatar TEXT, password_salt TEXT, last_login TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE invoices (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  subscription_id TEXT,
  invoice_number  TEXT NOT NULL,
  amount          REAL NOT NULL,
  tax             REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue','cancelled')),
  issue_date      TEXT NOT NULL,
  due_date        TEXT NOT NULL,
  notes           TEXT,
  paid_at         TEXT,
  billing_period TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id)     REFERENCES customers(id)    ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

CREATE INDEX idx_api_keys_organization ON api_keys(organization_id);

CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

CREATE INDEX idx_audit_log_organization ON audit_log(organization_id);

CREATE INDEX idx_customers_org        ON customers(organization_id);

CREATE INDEX idx_customers_status      ON customers(status);

CREATE INDEX idx_invoices_customer   ON invoices(customer_id);

CREATE INDEX idx_invoices_org        ON invoices(organization_id);

CREATE INDEX idx_invoices_status     ON invoices(status);

CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, attempted_at);

CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, attempted_at);

CREATE INDEX idx_network_devices_org ON network_devices(organization_id);

CREATE INDEX idx_notifications_org ON notifications(organization_id);

CREATE INDEX idx_notifications_user ON notifications(user_id);

CREATE INDEX idx_packages_active      ON packages(is_active);

CREATE INDEX idx_packages_org         ON packages(organization_id);

CREATE INDEX idx_password_resets_tok ON password_resets(token);

CREATE INDEX idx_password_resets_usr ON password_resets(user_id);

CREATE INDEX idx_payments_customer   ON payments(customer_id);

CREATE INDEX idx_payments_invoice    ON payments(invoice_id);

CREATE INDEX idx_payments_org        ON payments(organization_id);

CREATE INDEX idx_pppoe_customer ON pppoe_accounts(customer_id);

CREATE INDEX idx_pppoe_org ON pppoe_accounts(organization_id);

CREATE INDEX idx_pppoe_status ON pppoe_accounts(status);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE INDEX idx_sessions_token ON sessions(token);

CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE INDEX idx_settings_org ON settings(organization_id);

CREATE INDEX idx_subscriptions_cust   ON subscriptions(customer_id);

CREATE INDEX idx_subscriptions_org    ON subscriptions(organization_id);

CREATE INDEX idx_subscriptions_pkg    ON subscriptions(package_id);

CREATE INDEX idx_ticket_messages_tkt ON ticket_messages(ticket_id);

CREATE INDEX idx_tickets_customer    ON support_tickets(customer_id);

CREATE INDEX idx_tickets_org         ON support_tickets(organization_id);

CREATE INDEX idx_tickets_status      ON support_tickets(status);

CREATE INDEX idx_users_organization ON users(organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_subscription_period ON invoices(organization_id,subscription_id,billing_period) WHERE subscription_id IS NOT NULL AND billing_period IS NOT NULL;
