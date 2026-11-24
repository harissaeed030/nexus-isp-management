-- NEXUS D1 migration 0024: reconcile deployed production/staging schema drift.
-- This migration is designed for the already-populated NEXUS D1 databases.
-- Preflight (must return zero rows before applying):
--   SELECT tenant_id,table_name,record_id,COUNT(*) FROM sync_records
--   GROUP BY tenant_id,table_name,record_id HAVING COUNT(*)>1;
--   SELECT organization_id,lower(email),COUNT(*) FROM users
--   GROUP BY organization_id,lower(email) HAVING COUNT(*)>1;
-- It does not rewrite business rows. It standardizes indexes, enables
-- workspace-scoped staff emails, and creates the missing sync cursor table.

-- Workspace-scoped email uniqueness is enforced by idx_users_org_email_ci.
DROP INDEX IF EXISTS idx_users_email_global;

-- Bring the network/field indexes into parity on both databases.
CREATE INDEX IF NOT EXISTS idx_network_connectors_org_status
  ON network_connectors(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_network_devices_org_type
  ON network_devices(organization_id,device_type);
CREATE INDEX IF NOT EXISTS idx_network_jobs_connector_queue
  ON network_jobs(connector_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_network_jobs_org_created
  ON network_jobs(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_router_customer_mappings_org_customer
  ON router_customer_mappings(organization_id,customer_id);
CREATE INDEX IF NOT EXISTS idx_router_customer_mappings_org_online
  ON router_customer_mappings(organization_id,router_id,is_online);
CREATE INDEX IF NOT EXISTS idx_tr069_devices_connection
  ON tr069_devices(organization_id,acs_connection_id);

-- Preserve the production tenant-aware sync query plan and unique record key.
DROP INDEX IF EXISTS idx_sync_records_synced_at;
CREATE INDEX idx_sync_records_synced_at
  ON sync_records(tenant_id,table_name,synced_at);
DROP INDEX IF EXISTS idx_sync_records_tenant_table;
CREATE INDEX idx_sync_records_tenant_table
  ON sync_records(tenant_id,table_name,deleted);
DROP INDEX IF EXISTS idx_sync_records_unique;
CREATE UNIQUE INDEX idx_sync_records_unique
  ON sync_records(tenant_id,table_name,record_id);

-- Production already has this table; staging receives the same empty cursor table.
CREATE TABLE IF NOT EXISTS sync_state (
  tenant_id TEXT PRIMARY KEY,
  last_pull_since TEXT,
  updated_at TEXT NOT NULL
);

-- Production had these migration effects before their ledger entries were restored.
-- Staging already has the matching entries; INSERT OR IGNORE keeps it unchanged.
INSERT OR IGNORE INTO schema_migrations(id,name,applied_at) VALUES
 (14,'0014_router_credential_cipher',datetime('now')),
 (15,'0015_genieacs_tr069_inventory',datetime('now')),
 (16,'0016_router_customer_pppoe_mappings',datetime('now')),
 (17,'0017_users_password_hash_guard',datetime('now')),
 (18,'0018_reconcile_pppoe_and_sync_guards',datetime('now')),
 (19,'0019_restore_case_insensitive_user_email_uniqueness',datetime('now')),
 (20,'0020_allow_workspace_scoped_user_emails',datetime('now')),
 (21,'0021_field_operations',datetime('now')),
 (24,'0024_reconcile_deployed_schema_drift',datetime('now'));
