-- D1 migration 0009: repair production's missing explicit global user-email index.
-- Read-only preflight on 2026-11-15 found no duplicate exact emails in production or staging.
-- Additive and idempotent; does not rebuild users or alter records.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global ON users(email);

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(9,'0009_repair_global_user_email_index',datetime('now'));
