-- NEXUS D1 migration 0016: tenant-scoped RouterOS PPPoE customer mappings.
-- Apply only to a verified staging backup after schema preflight.

CREATE TABLE IF NOT EXISTS router_customer_mappings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  router_id TEXT NOT NULL REFERENCES network_devices(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  pppoe_username TEXT NOT NULL,
  is_online INTEGER NOT NULL DEFAULT 0 CHECK(is_online IN (0,1)),
  last_connected_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id,router_id,pppoe_username)
);

CREATE INDEX IF NOT EXISTS idx_router_customer_mappings_org_customer
  ON router_customer_mappings(organization_id,customer_id);
CREATE INDEX IF NOT EXISTS idx_router_customer_mappings_org_online
  ON router_customer_mappings(organization_id,router_id,is_online);

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(16,'0016_router_customer_pppoe_mappings',datetime('now'));
