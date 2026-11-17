-- NEXUS D1 migration 0022: security hardening.
-- IDs 14-21 are already assigned in the live staging migration ledger.
-- ID 22 is the next version unused in both inspected production and staging ledgers.
-- Additive objects only; no existing business rows are rewritten.
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
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users
  WHERE id=NEW.created_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'payment promise creator tenant mismatch') END;
END;
INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(22,'0022_security_hardening',datetime('now'));
