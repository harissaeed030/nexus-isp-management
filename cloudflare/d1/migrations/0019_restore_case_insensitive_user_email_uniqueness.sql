-- NEXUS D1 migration 0019: restore case-insensitive organization-scoped user email uniqueness.
-- Migration 0008 intended a UNIQUE index, but staging currently has a non-unique index
-- with the same name. IF NOT EXISTS cannot repair an index whose definition drifted.
-- Preflight: SELECT lower(email), COUNT(*) FROM users GROUP BY lower(email) HAVING COUNT(*)>1;
-- This migration is safe only when that query returns zero rows.
DROP INDEX IF EXISTS idx_users_org_email_ci;
CREATE UNIQUE INDEX idx_users_org_email_ci
  ON users(organization_id, lower(email));

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(19,'0019_restore_case_insensitive_user_email_uniqueness',datetime('now'));
