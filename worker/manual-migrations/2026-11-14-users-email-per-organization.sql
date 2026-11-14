-- NEXUS staging-only migration.
-- Rebuild users because the legacy table-level UNIQUE(email) constraint cannot be dropped.
-- IMPORTANT: Apply to a verified disposable/staging D1 database only after taking a backup.
-- Do not run against production as part of this change.
--
-- Foreign keys are disabled only for this single migration connection while the table is
-- rebuilt. All existing user IDs are preserved, so dependent rows keep their references.
PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE users__tenant_email_new (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL,
  email           TEXT NOT NULL,
  password_hash   TEXT,
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  name            TEXT,
  phone           TEXT,
  status          TEXT DEFAULT 'active',
  avatar          TEXT,
  password_salt   TEXT,
  last_login      TEXT,
  token_version   INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO users__tenant_email_new (
  id, organization_id, email, password_hash, role, created_at, updated_at,
  name, phone, status, avatar, password_salt, last_login, token_version
)
SELECT
  id, organization_id, email, password_hash, role, created_at, updated_at,
  name, phone, status, avatar, password_salt, last_login, token_version
FROM users;

DROP TABLE users;
ALTER TABLE users__tenant_email_new RENAME TO users;

CREATE INDEX idx_users_organization ON users(organization_id);
CREATE UNIQUE INDEX idx_users_org_email_ci
  ON users(organization_id, lower(email));

COMMIT;

PRAGMA foreign_keys = ON;

-- This query must return zero rows after the migration.
PRAGMA foreign_key_check;
