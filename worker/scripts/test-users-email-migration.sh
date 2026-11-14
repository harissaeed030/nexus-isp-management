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
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active',
  avatar TEXT,
  password_salt TEXT,
  last_login TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE support_tickets (id TEXT PRIMARY KEY, assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE ticket_messages (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE password_resets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
INSERT INTO organizations(id,name) VALUES ('org-a','ISP A'),('org-b','ISP B');
INSERT INTO users(id,organization_id,email,password_hash,role,name) VALUES
 ('user-a','org-a','owner@example.test','hash-a','owner','Owner A');
INSERT INTO sessions VALUES ('session-a','user-a');
INSERT INTO support_tickets VALUES ('ticket-a','user-a');
INSERT INTO ticket_messages VALUES ('message-a','user-a');
INSERT INTO notifications VALUES ('notification-a','user-a');
INSERT INTO password_resets VALUES ('reset-a','user-a');
SQL

sqlite3 "$DB" < "$MIGRATION"

# The existing account and dependent references must survive the table rebuild.
test "$(sqlite3 "$DB" "SELECT id || ':' || organization_id || ':' || email || ':' || role FROM users WHERE id='user-a';")" = "user-a:org-a:owner@example.test:owner"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sessions WHERE user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM support_tickets WHERE assigned_to='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM ticket_messages WHERE user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM notifications WHERE user_id='user-a';")" = "1"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM password_resets WHERE user_id='user-a';")" = "1"
test -z "$(sqlite3 "$DB" "PRAGMA foreign_key_check;")"

# The same email must be accepted in a different ISP workspace.
sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,role) VALUES ('user-b','org-b','owner@example.test','owner');"

# Email uniqueness remains case-insensitive inside one workspace.
if sqlite3 "$DB" "INSERT INTO users(id,organization_id,email,role) VALUES ('user-a-duplicate','org-a','OWNER@example.test','owner');" >/dev/null 2>&1; then
  echo "FAIL: duplicate email inside one workspace was accepted" >&2
  exit 1
fi

echo "PASS: user rows and dependent references preserved"
echo "PASS: same email accepted across different ISP workspaces"
echo "PASS: case-insensitive duplicate rejected within one workspace"
echo "PASS: foreign_key_check is clean"
