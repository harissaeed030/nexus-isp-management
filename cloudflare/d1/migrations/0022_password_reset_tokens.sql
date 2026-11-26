-- One-time staff-issued password reset tokens for the hosted D1 API.
-- Raw tokens are never stored; only SHA-256 hashes are persisted.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_org_user
  ON password_reset_tokens(organization_id, user_id, expires_at);
CREATE TRIGGER IF NOT EXISTS trg_password_reset_tokens_tenant_guard
BEFORE INSERT ON password_reset_tokens
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.user_id AND organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'password reset user tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.created_by AND organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'password reset actor tenant mismatch') END;
END;
INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
VALUES (22, '0022_password_reset_tokens', datetime('now'));
