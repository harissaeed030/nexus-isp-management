-- Migration 009: add session lifecycle metadata after the legacy session table exists.
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
