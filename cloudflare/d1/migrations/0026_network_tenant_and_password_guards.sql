-- NEXUS D1 migration 0026: reconcile network tenant and user password guards.
-- Additive and restart-safe. Existing staging triggers are left unchanged.
-- Apply only after backup restore verification and the migration rehearsal passes.

CREATE TRIGGER IF NOT EXISTS trg_network_connectors_tenant_guard
BEFORE INSERT ON network_connectors
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM users
      WHERE id = NEW.created_by
        AND organization_id = NEW.organization_id
    )
    THEN RAISE(ABORT, 'network connector creator tenant mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_network_jobs_tenant_guard
BEFORE INSERT ON network_jobs
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM network_connectors
      WHERE id = NEW.connector_id
        AND organization_id = NEW.organization_id
        AND status = 'active'
    )
    THEN RAISE(ABORT, 'network job connector tenant mismatch or disabled')
  END;
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM network_devices
      WHERE id = NEW.device_id
        AND organization_id = NEW.organization_id
        AND device_type = 'mikrotik'
    )
    THEN RAISE(ABORT, 'network job device tenant mismatch or unsupported type')
  END;
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM users
      WHERE id = NEW.created_by
        AND organization_id = NEW.organization_id
    )
    THEN RAISE(ABORT, 'network job creator tenant mismatch')
  END;
END;

-- Defense in depth. Production also has users.password_hash NOT NULL.
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
VALUES (26, '0026_network_tenant_and_password_guards', datetime('now'));
