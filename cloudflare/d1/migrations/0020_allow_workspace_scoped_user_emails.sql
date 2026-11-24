-- NEXUS D1 migration 0020: allow the same staff email in separate ISP workspaces.
-- Login must include workspace/tenantSlug when an email belongs to multiple organizations.
-- Keep case-insensitive uniqueness inside each organization (migration 0019).
-- Preflight: verify no case-insensitive duplicates inside an organization.
DROP INDEX IF EXISTS idx_users_email_global;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(20,'0020_allow_workspace_scoped_user_emails',datetime('now'));
