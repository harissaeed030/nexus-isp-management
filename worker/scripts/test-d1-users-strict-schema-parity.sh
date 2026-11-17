#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/worker/manual-migrations/2026-11-16-staging-users-strict-schema-parity.sql"
DB="$(mktemp)"
trap 'rm -f "$DB"' EXIT
command -v sqlite3 >/dev/null 2>&1 || { echo "sqlite3 CLI is required" >&2; exit 2; }

sqlite3 "$DB" <<'SQL'
PRAGMA foreign_keys=ON;
CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE);
CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE TABLE customers(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE TABLE users(
 id TEXT PRIMARY KEY DEFAULT(lower(hex(randomblob(16)))),organization_id TEXT NOT NULL,
 email TEXT NOT NULL,password_hash TEXT,role TEXT NOT NULL DEFAULT 'member',
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 name TEXT,phone TEXT,status TEXT DEFAULT 'active',avatar TEXT,password_salt TEXT,last_login TEXT,
 token_version INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE UNIQUE INDEX idx_users_email_global ON users(email);
CREATE UNIQUE INDEX idx_users_org_email_ci ON users(organization_id,lower(email));
CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE password_resets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE notifications(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,user_id TEXT,title TEXT NOT NULL,message TEXT,type TEXT DEFAULT 'info',is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT(datetime('now')),FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE support_tickets(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,customer_id TEXT,subject TEXT NOT NULL,description TEXT,priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN('low','medium','high','urgent')),status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','resolved','closed')),assigned_to TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),resolution TEXT,FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE ticket_messages(id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL,user_id TEXT,message TEXT NOT NULL,is_staff INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL);
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
CREATE TRIGGER trg_d1_notification_org_i BEFORE INSERT ON notifications WHEN NEW.user_id IS NOT NULL BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END; END;
CREATE TRIGGER trg_d1_notification_org_u BEFORE UPDATE OF organization_id,user_id ON notifications WHEN NEW.user_id IS NOT NULL BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END; END;
CREATE TRIGGER trg_d1_ticket_org_i BEFORE INSERT ON support_tickets BEGIN SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END; SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END; END;
CREATE TRIGGER trg_d1_ticket_org_u BEFORE UPDATE OF organization_id,customer_id,assigned_to ON support_tickets BEGIN SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END; SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END; END;
CREATE TRIGGER trg_d1_message_org_i BEFORE INSERT ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END; END;
CREATE TRIGGER trg_d1_message_org_u BEFORE UPDATE OF ticket_id,user_id ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END; END;
INSERT INTO organizations VALUES('org-a','ISP A','isp-a'),('org-b','ISP B','isp-b');
INSERT INTO users(id,organization_id,email,password_hash,role,name) VALUES('user-b','org-b','owner-b@example.test','hash-b','owner','Owner B');
INSERT INTO customers VALUES('cust-a','org-a');
INSERT INTO users(id,organization_id,email,password_hash,role,name) VALUES('user-a','org-a','owner@example.test','hash-a','owner','Owner A');
INSERT INTO sessions(id,user_id,token,expires_at) VALUES('session-a','user-a','session-token','2099-01-01');
INSERT INTO password_resets(id,user_id,token,expires_at) VALUES('reset-a','user-a','reset-token','2099-01-01');
INSERT INTO notifications(id,organization_id,user_id,title) VALUES('notification-a','org-a','user-a','Test notification');
INSERT INTO support_tickets(id,organization_id,customer_id,subject,assigned_to) VALUES('ticket-a','org-a','cust-a','Test ticket','user-a');
INSERT INTO ticket_messages(id,ticket_id,user_id,message,is_staff) VALUES('message-a','ticket-a','user-a','Test message',1);
SQL

sqlite3 "$DB" < "$MIGRATION"

test "$(sqlite3 "$DB" "SELECT id || ':' || organization_id || ':' || email || ':' || role FROM users WHERE id='user-a';")" = "user-a:org-a:owner@example.test:owner"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sessions WHERE id='session-a' AND user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM password_resets WHERE id='reset-a' AND user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM notifications WHERE id='notification-a' AND user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM support_tickets WHERE id='ticket-a' AND assigned_to='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM ticket_messages WHERE id='message-a' AND user_id='user-a';")" = "1"
test -z "$(sqlite3 "$DB" "PRAGMA foreign_key_check;")"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_d1_%';")" = "6"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('idx_users_organization','idx_users_email_global','idx_users_org_email_ci');")" = "3"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM schema_migrations WHERE id=10 AND name='0010_users_strict_schema_parity';")" = "1"

# Production-compatible constraints: missing password hash rejected; role defaults to staff.
if sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,role) VALUES('bad-null-hash','org-a','nullhash@example.test','staff');" >/dev/null 2>&1; then
 echo "FAIL: NULL password_hash was accepted" >&2; exit 1
fi
test "$(sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,password_hash) VALUES('default-role','org-a','default@example.test','hash') RETURNING role;")" = "staff"
# Explicit global exact-email uniqueness remains enforced.
if sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,password_hash,role) VALUES('duplicate-global','org-b','owner@example.test','hash','owner');" >/dev/null 2>&1; then
 echo "FAIL: duplicate global email was accepted" >&2; exit 1
fi
# Case-insensitive per-organization uniqueness remains enforced.
if sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,password_hash,role) VALUES('duplicate-case','org-a','OWNER@example.test','hash','owner');" >/dev/null 2>&1; then
 echo "FAIL: same-organization case-insensitive duplicate was accepted" >&2; exit 1
fi

echo "PASS: all user/dependent rows preserved"
echo "PASS: exact production users constraints/defaults and column order restored"
echo "PASS: global and organization-scoped email indexes preserved"
echo "PASS: six organization-integrity triggers restored"

# Cross-tenant relationships must be rejected by the restored integrity triggers.
if sqlite3 "$DB" "INSERT INTO notifications(id,organization_id,user_id,title) VALUES('bad-notification','org-a','user-b','Cross-tenant');" >/dev/null 2>&1; then
 echo "FAIL: cross-tenant notification user was accepted" >&2; exit 1
fi
if sqlite3 "$DB" "INSERT INTO support_tickets(id,organization_id,subject,assigned_to) VALUES('bad-ticket','org-a','Cross-tenant assignee','user-b');" >/dev/null 2>&1; then
 echo "FAIL: cross-tenant ticket assignee was accepted" >&2; exit 1
fi
if sqlite3 "$DB" "INSERT INTO ticket_messages(id,ticket_id,user_id,message) VALUES('bad-message','ticket-a','user-b','Cross-tenant message');" >/dev/null 2>&1; then
 echo "FAIL: cross-tenant ticket message user was accepted" >&2; exit 1
fi
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM notifications WHERE id='bad-notification';")" = "0"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM support_tickets WHERE id='bad-ticket';")" = "0"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM ticket_messages WHERE id='bad-message';")" = "0"
echo "PASS: cross-tenant notification, ticket-assignee and ticket-message writes rejected"

echo "PASS: PRAGMA foreign_key_check is clean"
