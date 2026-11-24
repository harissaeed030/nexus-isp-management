-- D1 migration 0023: isolated, authenticated-ciphertext RouterOS credentials.
-- Additive and idempotent. Does not alter existing network-device rows.
-- No password or ciphertext is returned by any router inventory API.
-- Do not deploy until fresh D1 exports and a disposable migration rehearsal pass.

CREATE TABLE IF NOT EXISTS router_credentials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  network_device_id TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (network_device_id) REFERENCES network_devices(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_router_credentials_org_device
  ON router_credentials(organization_id,network_device_id);

CREATE TRIGGER IF NOT EXISTS trg_router_credentials_org_i
BEFORE INSERT ON router_credentials BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM network_devices WHERE id=NEW.network_device_id AND organization_id=NEW.organization_id AND device_type='mikrotik'
 ) THEN RAISE(ABORT,'router credential device organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'router credential creator organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'router credential updater organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_router_credentials_org_u
BEFORE UPDATE OF organization_id,network_device_id,created_by,updated_by ON router_credentials BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM network_devices WHERE id=NEW.network_device_id AND organization_id=NEW.organization_id AND device_type='mikrotik'
 ) THEN RAISE(ABORT,'router credential device organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'router credential creator organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id
 ) THEN RAISE(ABORT,'router credential updater organization mismatch') END;
END;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(23,'0023_router_credentials_ciphertext',datetime('now'));
