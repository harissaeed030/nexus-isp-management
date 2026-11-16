-- D1 migration 0010: align PPPoE connection metadata with the local SQLite account model.
-- Apply only once after verifying schema_migrations does not contain id=10.
-- Password ciphertext format remains owned by the Worker encryption layer.

ALTER TABLE pppoe_accounts ADD COLUMN router_id TEXT;
ALTER TABLE pppoe_accounts ADD COLUMN mac_address TEXT;
ALTER TABLE pppoe_accounts ADD COLUMN last_connected_at TEXT;
ALTER TABLE pppoe_accounts ADD COLUMN last_disconnected_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pppoe_org_customer ON pppoe_accounts(organization_id,customer_id);
CREATE INDEX IF NOT EXISTS idx_pppoe_org_status ON pppoe_accounts(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_pppoe_org_router ON pppoe_accounts(organization_id,router_id);

CREATE TRIGGER IF NOT EXISTS trg_d1_pppoe_router_org_i
BEFORE INSERT ON pppoe_accounts WHEN NEW.router_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.router_id AND organization_id=NEW.organization_id AND device_type='mikrotik')
 THEN RAISE(ABORT,'PPPoE router organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_pppoe_router_org_u
BEFORE UPDATE OF organization_id,router_id ON pppoe_accounts WHEN NEW.router_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.router_id AND organization_id=NEW.organization_id AND device_type='mikrotik')
 THEN RAISE(ABORT,'PPPoE router organization mismatch') END;
END;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(10,'0010_pppoe_connection_metadata',datetime('now'));
