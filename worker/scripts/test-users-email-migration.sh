#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/worker/manual-migrations/2026-11-14-users-email-per-organization.sql"
DB="$(mktemp)"
trap 'rm -f "$DB"' EXIT

command -v sqlite3 >/dev/null 2>&1 || {
  echo "sqlite3 CLI is required" >&2
  exit 2
}

sqlite3 "$DB" <<'SQL'
PRAGMA foreign_keys = ON;
CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE);
CREATE TABLE customers(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE TABLE users(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT, role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  name TEXT, phone TEXT, status TEXT DEFAULT 'active', avatar TEXT, password_salt TEXT,
  last_login TEXT, token_version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE TABLE sessions(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE password_resets(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE notifications(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT, title TEXT NOT NULL,
  message TEXT, type TEXT DEFAULT 'info', is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT(datetime('now')),
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE support_tickets(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, customer_id TEXT, subject TEXT NOT NULL,
  description TEXT, priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open', assigned_to TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  resolution TEXT,
  FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE ticket_messages(
  id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, user_id TEXT, message TEXT NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
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
INSERT INTO organizations(id,name,slug) VALUES('org-a','ISP A','isp-a'),('org-b','ISP B','isp-b');
INSERT INTO customers(id,organization_id) VALUES('customer-a','org-a');
INSERT INTO users(id,organization_id,email,password_hash,role,name) VALUES('user-a','org-a','owner@example.test','hash-a','owner','Owner A');
INSERT INTO sessions(id,user_id,token,expires_at) VALUES('session-a','user-a','session-token','2099-01-01');
INSERT INTO password_resets(id,user_id,token,expires_at) VALUES('reset-a','user-a','reset-token','2099-01-01');
INSERT INTO notifications(id,organization_id,user_id,title) VALUES('notification-a','org-a','user-a','Test notification');
INSERT INTO support_tickets(id,organization_id,customer_id,subject,assigned_to) VALUES('ticket-a','org-a','customer-a','Test ticket','user-a');
INSERT INTO ticket_messages(id,ticket_id,user_id,message,is_staff) VALUES('message-a','ticket-a','user-a','Test message',1);
SQL

sqlite3 "$DB" < "$MIGRATION"

# The existing user and every dependent row must survive with foreign keys enabled.
test "$(sqlite3 "$DB" "SELECT id || ':' || organization_id || ':' || email || ':' || role FROM users WHERE id='user-a';")" = "user-a:org-a:owner@example.test:owner"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sessions WHERE user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM password_resets WHERE user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM notifications WHERE user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM support_tickets WHERE assigned_to='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM ticket_messages WHERE user_id='user-a';")" = "1"
test -z "$(sqlite3 "$DB" "PRAGMA foreign_key_check;")"

# Same address is allowed in another ISP workspace.
sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,role) VALUES('user-b','org-b','OWNER@example.test','owner');"

# But a case-insensitive duplicate inside the same workspace is rejected.
if sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,role) VALUES('user-a-duplicate','org-a','OWNER@example.test','owner');" >/dev/null 2>&1; then
  echo "FAIL: duplicate email inside one workspace was accepted" >&2
  exit 1
fi

# All six organization-integrity triggers must be restored and remain active.
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_d1_%';")" = "6"

if sqlite3 "$DB" "INSERT INTO notifications(id,organization_id,user_id,title) VALUES('bad-notification','org-b','user-a','bad');" >/dev/null 2>&1; then
  echo "FAIL: cross-workspace notification user was accepted" >&2
  exit 1
fi
if sqlite3 "$DB" "INSERT INTO support_tickets(id,organization_id,customer_id,subject) VALUES('bad-ticket-customer','org-b','customer-a','bad');" >/dev/null 2>&1; then
  echo "FAIL: cross-workspace ticket customer was accepted" >&2
  exit 1
fi
if sqlite3 "$DB" "INSERT INTO support_tickets(id,organization_id,subject,assigned_to) VALUES('bad-ticket-assignee','org-a','bad','user-b');" >/dev/null 2>&1; then
  echo "FAIL: cross-workspace ticket assignee was accepted" >&2
  exit 1
fi
if sqlite3 "$DB" "INSERT INTO ticket_messages(id,ticket_id,user_id,message) VALUES('bad-message','ticket-a','user-b','bad');" >/dev/null 2>&1; then
  echo "FAIL: cross-workspace ticket message author was accepted" >&2
  exit 1
fi

echo "PASS: user rows and all dependent rows preserved with foreign keys enabled"
echo "PASS: same email accepted across different ISP workspaces"
echo "PASS: case-insensitive duplicate rejected within one workspace"
echo "PASS: all six organization-integrity triggers restored and enforced"
echo "PASS: foreign_key_check is clean"
