-- D1 migration 0008: align user email uniqueness across production and staging.
-- Preflight: verify no duplicate email values and no case-insensitive duplicates per organization.
-- Additive: no table rebuilds and no user records are changed.
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_email_ci ON users(organization_id, lower(email));

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(8,'0008_user_email_index_parity',datetime('now'));
