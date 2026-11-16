-- NEXUS staging-only D1 schema-parity migration.
-- Target: nexus-saas-staging-db only. Never run against production.
-- Rebuilds staging users to match the already-verified stricter production table.
-- Preserves every user and dependent row; recreates indexes and org-integrity triggers.
-- Requires a fresh staging export and a successful disposable-D1 restore rehearsal first.

CREATE TABLE _nexus_parity_users AS SELECT * FROM users;
CREATE TABLE _nexus_parity_sessions AS SELECT * FROM sessions;
CREATE TABLE _nexus_parity_password_resets AS SELECT * FROM password_resets;
CREATE TABLE _nexus_parity_notifications AS SELECT * FROM notifications;
CREATE TABLE _nexus_parity_support_tickets AS SELECT * FROM support_tickets;
CREATE TABLE _nexus_parity_ticket_messages AS SELECT * FROM ticket_messages;

-- Drop dependent tables before users to prevent FK cascades from changing backups.
DROP TABLE ticket_messages;
DROP TABLE support_tickets;
DROP TABLE notifications;
DROP TABLE sessions;
DROP TABLE password_resets;
DROP TABLE users;

-- Match the exact production users column order and constraints.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active',
  avatar TEXT,
  password_salt TEXT,
  last_login TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
INSERT INTO users (
 id,organization_id,email,password_hash,role,name,phone,status,avatar,
 password_salt,last_login,token_version,created_at,updated_at
)
SELECT
 id,organization_id,email,password_hash,role,name,phone,status,avatar,
 password_salt,last_login,token_version,created_at,updated_at
FROM _nexus_parity_users;

CREATE INDEX idx_users_organization ON users(organization_id);
CREATE UNIQUE INDEX idx_users_email_global ON users(email);
CREATE UNIQUE INDEX idx_users_org_email_ci ON users(organization_id, lower(email));

CREATE TABLE sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO sessions SELECT * FROM _nexus_parity_sessions;

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO password_resets SELECT * FROM _nexus_parity_password_resets;

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO notifications SELECT * FROM _nexus_parity_notifications;

CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  customer_id TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
  assigned_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolution TEXT,
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO support_tickets SELECT * FROM _nexus_parity_support_tickets;

CREATE TABLE ticket_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  ticket_id TEXT NOT NULL,
  user_id TEXT,
  message TEXT NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO ticket_messages SELECT * FROM _nexus_parity_ticket_messages;

-- Restore all indexes and organization-integrity triggers removed with dependants.
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_password_resets_tok ON password_resets(token);
CREATE INDEX idx_password_resets_usr ON password_resets(user_id);
CREATE INDEX idx_notifications_org ON notifications(organization_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_tickets_customer ON support_tickets(customer_id);
CREATE INDEX idx_tickets_org ON support_tickets(organization_id);
CREATE INDEX idx_tickets_org_customer_assignee ON support_tickets(organization_id,customer_id,assigned_to);
CREATE INDEX idx_tickets_status ON support_tickets(status);
CREATE INDEX idx_ticket_messages_ticket_user ON ticket_messages(ticket_id,user_id);
CREATE INDEX idx_ticket_messages_tkt ON ticket_messages(ticket_id);

CREATE TRIGGER trg_d1_notification_org_i BEFORE INSERT ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END;
END;
CREATE TRIGGER trg_d1_notification_org_u BEFORE UPDATE OF organization_id,user_id ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END;
END;
CREATE TRIGGER trg_d1_ticket_org_i BEFORE INSERT ON support_tickets BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END;
 SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END;
END;
CREATE TRIGGER trg_d1_ticket_org_u BEFORE UPDATE OF organization_id,customer_id,assigned_to ON support_tickets BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END;
 SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END;
END;
CREATE TRIGGER trg_d1_message_org_i BEFORE INSERT ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END;
END;
CREATE TRIGGER trg_d1_message_org_u BEFORE UPDATE OF ticket_id,user_id ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END;
END;

DROP TABLE _nexus_parity_users;
DROP TABLE _nexus_parity_sessions;
DROP TABLE _nexus_parity_password_resets;
DROP TABLE _nexus_parity_notifications;
DROP TABLE _nexus_parity_support_tickets;
DROP TABLE _nexus_parity_ticket_messages;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at) VALUES(10,'0010_users_strict_schema_parity',datetime('now'));

-- Run PRAGMA foreign_key_check after migration; it must return zero rows.
