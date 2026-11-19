-- NEXUS D1 migration 0022: security hardening.
-- IDs 10-21 are already assigned in the inspected live staging history.
-- This migration is independent of optional billing tables.
-- Additive only; no existing business rows are modified.
CREATE TABLE IF NOT EXISTS registration_attempts(
 id TEXT PRIMARY KEY,
 ip_address TEXT NOT NULL,
 email TEXT,
 attempted_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_registration_attempts_ip_time
 ON registration_attempts(ip_address,attempted_at);
CREATE INDEX IF NOT EXISTS idx_registration_attempts_email_time
 ON registration_attempts(email,attempted_at);
INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(22,'0022_security_hardening',datetime('now'));
