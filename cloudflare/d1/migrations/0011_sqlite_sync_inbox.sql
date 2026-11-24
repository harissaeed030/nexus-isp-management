-- Migration 0011: safe, idempotent SQLite-to-D1 sync registry.
-- No existing business rows are modified by this migration.
CREATE TABLE IF NOT EXISTS sync_tenant_mappings (
  source_tenant_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('customers','packages','subscriptions','invoices','payments')),
  entity_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sync_operations_org_entity ON sync_operations(organization_id,entity_type,entity_id);
