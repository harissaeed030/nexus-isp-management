-- NEXUS D1 migration 0015: tenant-scoped GenieACS / TR-069 inventory.
-- Apply only to a verified staging backup after schema preflight. Never auto-apply to production.

CREATE TABLE IF NOT EXISTS acs_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  username_cipher TEXT,
  password_cipher TEXT,
  token_cipher TEXT,
  timeout_ms INTEGER NOT NULL DEFAULT 8000 CHECK(timeout_ms BETWEEN 1000 AND 30000),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  last_test_at TEXT,
  last_test_ok INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id,name),
  CHECK((token_cipher IS NOT NULL AND username_cipher IS NULL AND password_cipher IS NULL)
     OR (token_cipher IS NULL AND username_cipher IS NOT NULL AND password_cipher IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS tr069_devices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  acs_connection_id TEXT NOT NULL REFERENCES acs_connections(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  manufacturer TEXT,
  oui TEXT,
  product_class TEXT,
  model TEXT,
  serial_number TEXT,
  last_inform_at TEXT,
  last_boot_at TEXT,
  inform_status TEXT NOT NULL DEFAULT 'unknown',
  parameter_snapshot TEXT NOT NULL DEFAULT '{}',
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id,acs_connection_id,device_id)
);

CREATE TABLE IF NOT EXISTS tr069_audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  device_id TEXT,
  acs_connection_id TEXT,
  action TEXT NOT NULL,
  parameter_name TEXT,
  old_value TEXT,
  new_value TEXT,
  result TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_acs_connections_org ON acs_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_tr069_devices_org_inform ON tr069_devices(organization_id,last_inform_at);
CREATE INDEX IF NOT EXISTS idx_tr069_devices_connection ON tr069_devices(organization_id,acs_connection_id);
CREATE INDEX IF NOT EXISTS idx_tr069_audit_org_created ON tr069_audit_logs(organization_id,created_at);

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(15,'0015_genieacs_tr069_inventory',datetime('now'));
