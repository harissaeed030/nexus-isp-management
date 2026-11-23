-- Canonical Cloudflare D1 schema snapshot from verified staging (schema migration 0007).
-- Use only to initialize a new, empty D1 database. Never run this snapshot over an existing database.
-- Existing databases must use incremental migrations in cloudflare/d1/migrations/.
-- Cloudflare-managed _cf_KV is intentionally excluded.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  label           TEXT,
  last_used_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT,
  user_id         TEXT,
  action          TEXT NOT NULL,
  detail          TEXT,
  ip_address      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_portal_accounts(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,customer_id TEXT NOT NULL,email TEXT NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),token_version INTEGER NOT NULL DEFAULT 0,last_login TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(organization_id,email),UNIQUE(organization_id,customer_id),FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS customers (
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

CREATE TABLE IF NOT EXISTS invoices (
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
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')), billing_period TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id)     REFERENCES customers(id)    ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
        id TEXT PRIMARY KEY,
        ip_address TEXT NOT NULL,
        email TEXT NOT NULL,
        attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

CREATE TABLE IF NOT EXISTS network_devices (
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now')), model TEXT, management_protocol TEXT, pon_ports INTEGER,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      );

CREATE TABLE IF NOT EXISTS router_credentials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  network_device_id TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (network_device_id) REFERENCES network_devices(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
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

CREATE TABLE IF NOT EXISTS onu_devices(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,olt_device_id TEXT,customer_id TEXT,serial_number TEXT NOT NULL,mac_address TEXT,pon_port TEXT,onu_number INTEGER,model TEXT,status TEXT NOT NULL DEFAULT 'unknown',rx_power_dbm REAL,last_seen_at TEXT,notes TEXT,created_at TEXT DEFAULT(datetime('now')),updated_at TEXT DEFAULT(datetime('now')),UNIQUE(organization_id,serial_number));

CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, email TEXT, phone TEXT, address TEXT, currency TEXT DEFAULT 'USD', logo TEXT);

CREATE TABLE IF NOT EXISTS packages (
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

CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
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

CREATE TABLE IF NOT EXISTS pppoe_accounts (
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

CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,payment_id TEXT NOT NULL,invoice_id TEXT NOT NULL,customer_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL DEFAULT 'cash',reference TEXT,reason TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),created_by TEXT NOT NULL,completed_by TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),completed_at TEXT, idempotency_key TEXT,FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE,FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);

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

CREATE TABLE IF NOT EXISTS schema_migrations (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      key             TEXT NOT NULL,
      value           TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      UNIQUE (organization_id, key),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS subscriptions (
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

CREATE TABLE IF NOT EXISTS support_tickets (
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

CREATE TABLE IF NOT EXISTS ticket_messages (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  ticket_id       TEXT NOT NULL,
  user_id         TEXT,
  message         TEXT NOT NULL,
  is_staff        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)            ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_permissions(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,user_id TEXT NOT NULL,permission TEXT NOT NULL,allowed INTEGER NOT NULL CHECK(allowed IN(0,1)),updated_by TEXT,updated_at TEXT DEFAULT(datetime('now')),UNIQUE(organization_id,user_id,permission));

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')), name TEXT, phone TEXT, status TEXT DEFAULT 'active', avatar TEXT, password_salt TEXT, last_login TEXT, token_version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_organization ON api_keys(organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_organization ON audit_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_customers_org        ON customers(organization_id);

CREATE INDEX IF NOT EXISTS idx_customers_status      ON customers(status);

CREATE INDEX IF NOT EXISTS idx_invoices_customer   ON invoices(customer_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org        ON invoices(organization_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org_customer_subscription ON invoices(organization_id,customer_id,subscription_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_number ON invoices(organization_id,invoice_number);

CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_subscription_period ON invoices(organization_id,subscription_id,billing_period) WHERE subscription_id IS NOT NULL AND billing_period IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, attempted_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, attempted_at);

CREATE INDEX IF NOT EXISTS idx_network_devices_org ON network_devices(organization_id);

CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_onu_devices_org_status ON onu_devices(organization_id,status);

CREATE INDEX IF NOT EXISTS idx_onu_org_customer_olt ON onu_devices(organization_id,customer_id,olt_device_id);

CREATE INDEX IF NOT EXISTS idx_packages_active      ON packages(is_active);

CREATE INDEX IF NOT EXISTS idx_packages_org         ON packages(organization_id);

CREATE INDEX IF NOT EXISTS idx_password_resets_tok ON password_resets(token);

CREATE INDEX IF NOT EXISTS idx_password_resets_usr ON password_resets(user_id);

CREATE INDEX IF NOT EXISTS idx_payments_customer   ON payments(customer_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice    ON payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_org        ON payments(organization_id);

CREATE INDEX IF NOT EXISTS idx_payments_org_invoice_customer ON payments(organization_id,invoice_id,customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_org_reference ON payments(organization_id,transaction_ref) WHERE transaction_ref IS NOT NULL AND transaction_ref<>'';

CREATE INDEX IF NOT EXISTS idx_permissions_org_user ON user_permissions(organization_id,user_id);

CREATE INDEX IF NOT EXISTS idx_pppoe_customer ON pppoe_accounts(customer_id);

CREATE INDEX IF NOT EXISTS idx_pppoe_org ON pppoe_accounts(organization_id);

CREATE INDEX IF NOT EXISTS idx_pppoe_org_customer ON pppoe_accounts(organization_id,customer_id);

CREATE INDEX IF NOT EXISTS idx_pppoe_status ON pppoe_accounts(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_org_idempotency ON refunds(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key<>'';

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_org_reference ON refunds(organization_id,reference) WHERE reference IS NOT NULL AND reference<>'';

CREATE INDEX IF NOT EXISTS idx_refunds_payment_status ON refunds(organization_id,payment_id,status);

CREATE INDEX IF NOT EXISTS idx_router_credentials_org_device ON router_credentials(organization_id,network_device_id);

CREATE INDEX IF NOT EXISTS idx_payment_promises_org_status_date ON payment_promises(organization_id,status,promise_date);
CREATE INDEX IF NOT EXISTS idx_payment_promises_org_customer ON payment_promises(organization_id,customer_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_settings_org ON settings(organization_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_cust   ON subscriptions(customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org    ON subscriptions(organization_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_customer_package ON subscriptions(organization_id,customer_id,package_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_pkg    ON subscriptions(package_id);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_user ON ticket_messages(ticket_id,user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_tkt ON ticket_messages(ticket_id);

CREATE INDEX IF NOT EXISTS idx_tickets_customer    ON support_tickets(customer_id);

CREATE INDEX IF NOT EXISTS idx_tickets_org         ON support_tickets(organization_id);

CREATE INDEX IF NOT EXISTS idx_tickets_org_customer_assignee ON support_tickets(organization_id,customer_id,assigned_to);

CREATE INDEX IF NOT EXISTS idx_tickets_status      ON support_tickets(status);

CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_email_ci ON users(organization_id, lower(email));

CREATE TRIGGER IF NOT EXISTS trg_d1_audit_org_i BEFORE INSERT ON audit_log WHEN NEW.organization_id IS NOT NULL AND NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'audit actor organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_audit_org_u BEFORE UPDATE OF organization_id,user_id ON audit_log WHEN NEW.organization_id IS NOT NULL AND NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'audit actor organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_invoice_org_i BEFORE INSERT ON invoices BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'invoice customer organization mismatch') END;
 SELECT CASE WHEN NEW.subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND organization_id=NEW.organization_id AND customer_id=NEW.customer_id) THEN RAISE(ABORT,'invoice subscription organization/customer mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_invoice_org_u BEFORE UPDATE OF organization_id,customer_id,subscription_id ON invoices BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'invoice customer organization mismatch') END;
 SELECT CASE WHEN NEW.subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND organization_id=NEW.organization_id AND customer_id=NEW.customer_id) THEN RAISE(ABORT,'invoice subscription organization/customer mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_message_org_i BEFORE INSERT ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_message_org_u BEFORE UPDATE OF ticket_id,user_id ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_notification_org_i BEFORE INSERT ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_notification_org_u BEFORE UPDATE OF organization_id,user_id ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_onu_org_i BEFORE INSERT ON onu_devices BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU customer organization mismatch') END;
 SELECT CASE WHEN NEW.olt_device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.olt_device_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU OLT organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_onu_org_u BEFORE UPDATE OF organization_id,customer_id,olt_device_id ON onu_devices BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU customer organization mismatch') END;
 SELECT CASE WHEN NEW.olt_device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.olt_device_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU OLT organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_payment_org_i BEFORE INSERT ON payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices i JOIN customers c ON c.id=NEW.customer_id WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.customer_id=NEW.customer_id AND c.organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment invoice/customer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_payment_org_u BEFORE UPDATE OF organization_id,invoice_id,customer_id ON payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices i JOIN customers c ON c.id=NEW.customer_id WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.customer_id=NEW.customer_id AND c.organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment invoice/customer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_permission_org_i BEFORE INSERT ON user_permissions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission user organization mismatch') END;
 SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission actor organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_permission_org_u BEFORE UPDATE OF organization_id,user_id,updated_by ON user_permissions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission user organization mismatch') END;
 SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission actor organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_portal_org_i BEFORE INSERT ON customer_portal_accounts BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'portal account customer organization mismatch') END; END;

CREATE TRIGGER IF NOT EXISTS trg_d1_portal_org_u BEFORE UPDATE OF organization_id,customer_id ON customer_portal_accounts BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'portal account customer organization mismatch') END; END;

CREATE TRIGGER IF NOT EXISTS trg_d1_pppoe_org_i BEFORE INSERT ON pppoe_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'PPPoE customer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_pppoe_org_u BEFORE UPDATE OF organization_id,customer_id ON pppoe_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'PPPoE customer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_promise_org_i BEFORE INSERT ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment promise customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment promise creator organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_promise_org_u BEFORE UPDATE OF organization_id,customer_id,created_by,updated_by ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment promise customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment promise creator organization mismatch') END;
 SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment promise updater organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_router_credentials_org_i BEFORE INSERT ON router_credentials BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.network_device_id AND organization_id=NEW.organization_id AND device_type='mikrotik') THEN RAISE(ABORT,'router credential device organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'router credential creator organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'router credential updater organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_router_credentials_org_u BEFORE UPDATE OF organization_id,network_device_id,created_by,updated_by ON router_credentials BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.network_device_id AND organization_id=NEW.organization_id AND device_type='mikrotik') THEN RAISE(ABORT,'router credential device organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'router credential creator organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'router credential updater organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_refund_org_i BEFORE INSERT ON refunds BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payments p JOIN invoices i ON i.id=NEW.invoice_id JOIN customers c ON c.id=NEW.customer_id WHERE p.id=NEW.payment_id AND p.organization_id=NEW.organization_id AND i.organization_id=NEW.organization_id AND c.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id AND p.customer_id=NEW.customer_id AND i.customer_id=NEW.customer_id) THEN RAISE(ABORT,'refund payment/invoice/customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund creator organization mismatch') END;
 SELECT CASE WHEN NEW.completed_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.completed_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund completer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_refund_org_u BEFORE UPDATE OF organization_id,payment_id,invoice_id,customer_id,created_by,completed_by ON refunds BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payments p JOIN invoices i ON i.id=NEW.invoice_id JOIN customers c ON c.id=NEW.customer_id WHERE p.id=NEW.payment_id AND p.organization_id=NEW.organization_id AND i.organization_id=NEW.organization_id AND c.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id AND p.customer_id=NEW.customer_id AND i.customer_id=NEW.customer_id) THEN RAISE(ABORT,'refund payment/invoice/customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund creator organization mismatch') END;
 SELECT CASE WHEN NEW.completed_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.completed_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund completer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_sub_org_i BEFORE INSERT ON subscriptions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM packages WHERE id=NEW.package_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription package organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_sub_org_u BEFORE UPDATE OF organization_id,customer_id,package_id ON subscriptions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM packages WHERE id=NEW.package_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription package organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_ticket_org_i BEFORE INSERT ON support_tickets BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END;
 SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_ticket_org_u BEFORE UPDATE OF organization_id,customer_id,assigned_to ON support_tickets BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END;
 SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END;
END;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at) VALUES
(1,'0001_saas_foundation','2026-11-10 12:44:49'),
(2,'0002_auth_sessions','2026-11-10 14:23:05'),
(3,'0003_isp_modules','2026-11-10 14:23:16'),
(4,'0004_add_missing_columns_and_tables','2026-11-12 17:51:19'),
(5,'0005_sync_staging_schema','2026-11-13 23:41:19'),
(6,'0006_d1_tenant_integrity_guards','2026-11-15 01:17:52'),
(7,'0007_customer_portal_tenant_guards','2026-11-15 01:18:15'),
(8,'0008_user_email_index_parity','2026-11-15 15:35:00'),
(9,'0009_repair_global_user_email_index','2026-11-15 15:45:24'),
(22,'0022_payment_promises','2026-11-23 06:00:00'),
(23,'0023_router_credentials_ciphertext','2026-11-23 06:15:00');
