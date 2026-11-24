-- NEXUS D1 migration 0018: reconcile staging PPPoE router guards and sync idempotency index.
-- This is a corrective migration for databases where migration 0010's columns/indexes
-- and migration 0011's sync tables already exist but their guards/index differ.
-- It deliberately does not rebuild tables or touch business rows.

DROP TRIGGER IF EXISTS trg_d1_pppoe_router_org_i;
DROP TRIGGER IF EXISTS trg_d1_pppoe_router_org_u;

CREATE TRIGGER trg_d1_pppoe_router_org_i
BEFORE INSERT ON pppoe_accounts
WHEN NEW.router_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM network_devices
    WHERE id = NEW.router_id
      AND organization_id = NEW.organization_id
      AND device_type = 'mikrotik'
  ) THEN RAISE(ABORT, 'PPPoE router organization mismatch') END;
END;

CREATE TRIGGER trg_d1_pppoe_router_org_u
BEFORE UPDATE OF organization_id, router_id ON pppoe_accounts
WHEN NEW.router_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM network_devices
    WHERE id = NEW.router_id
      AND organization_id = NEW.organization_id
      AND device_type = 'mikrotik'
  ) THEN RAISE(ABORT, 'PPPoE router organization mismatch') END;
END;

DROP INDEX IF EXISTS idx_sync_operations_org_entity;
CREATE INDEX idx_sync_operations_org_entity
  ON sync_operations(organization_id, entity_type, entity_id);

-- Record migration 0010 only after its columns/indexes and corrected guards are present.
INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
VALUES (10, '0010_pppoe_connection_metadata', datetime('now'));

INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
VALUES (18, '0018_reconcile_pppoe_and_sync_guards', datetime('now'));
