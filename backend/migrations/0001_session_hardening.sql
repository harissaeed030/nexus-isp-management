-- Add session lifecycle metadata and an expiry lookup index.
-- Applied by the versioned migration runner after the baseline schema exists.
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
