-- NEXUS D1 migration 0014: encrypted RouterOS credential storage.
-- Apply manually to a verified staging backup before deploying router inventory code.
-- The Worker encrypts passwords with the existing JWT_SECRET-derived AES-GCM key.

ALTER TABLE network_devices ADD COLUMN credential_password_cipher TEXT;

CREATE INDEX IF NOT EXISTS idx_network_devices_org_type
  ON network_devices(organization_id, device_type);

INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
VALUES (14, '0014_router_credential_cipher', datetime('now'));
