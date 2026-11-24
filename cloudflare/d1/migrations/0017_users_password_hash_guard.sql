-- NEXUS D1 migration 0017: enforce password-hash presence in staging-compatible schemas.
-- Production already has a NOT NULL constraint. These guards align older staging DDL
-- without rebuilding the populated users table or changing existing rows.

CREATE TRIGGER IF NOT EXISTS trg_users_password_hash_insert
BEFORE INSERT ON users
WHEN NEW.password_hash IS NULL OR length(trim(NEW.password_hash)) = 0
BEGIN
  SELECT RAISE(ABORT, 'users.password_hash is required');
END;

CREATE TRIGGER IF NOT EXISTS trg_users_password_hash_update
BEFORE UPDATE OF password_hash ON users
WHEN NEW.password_hash IS NULL OR length(trim(NEW.password_hash)) = 0
BEGIN
  SELECT RAISE(ABORT, 'users.password_hash is required');
END;

INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
VALUES (17, '0017_users_password_hash_guard', datetime('now'));
