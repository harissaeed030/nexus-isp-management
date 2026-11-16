-- Migration 011: normalize PPPoE credentials and strengthen core tenant relationships.
-- Additive and safe for existing SQLite databases. Existing customer PPPoE usernames
-- are copied into the dedicated account table; passwords are intentionally not inferred.

CREATE TABLE IF NOT EXISTS pppoe_accounts (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 router_id TEXT REFERENCES routers(id) ON DELETE SET NULL,
 username TEXT NOT NULL,
 password_ciphertext TEXT,
 ip_address TEXT,
 mac_address TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','disconnected','disabled')),
 last_connected_at TEXT,
 last_disconnected_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,username),
 UNIQUE(tenant_id,customer_id)
);

INSERT OR IGNORE INTO pppoe_accounts
 (id,tenant_id,customer_id,router_id,username,status,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),c.tenant_id,c.id,c.pppoe_router_id,c.pppoe_username,
        CASE WHEN c.status='active' THEN 'active' ELSE 'suspended' END,
        c.created_at,CURRENT_TIMESTAMP
 FROM customers c
 WHERE c.pppoe_username IS NOT NULL AND trim(c.pppoe_username)<>'';

CREATE INDEX IF NOT EXISTS idx_pppoe_tenant_status ON pppoe_accounts(tenant_id,status);
CREATE INDEX IF NOT EXISTS idx_pppoe_customer ON pppoe_accounts(tenant_id,customer_id);
CREATE INDEX IF NOT EXISTS idx_pppoe_router ON pppoe_accounts(tenant_id,router_id);

CREATE TRIGGER IF NOT EXISTS trg_pppoe_tenant_insert
BEFORE INSERT ON pppoe_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'PPPoE customer tenant mismatch') END;
 SELECT CASE WHEN NEW.router_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM routers WHERE id=NEW.router_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'PPPoE router tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_pppoe_tenant_update
BEFORE UPDATE OF tenant_id,customer_id,router_id ON pppoe_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'PPPoE customer tenant mismatch') END;
 SELECT CASE WHEN NEW.router_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM routers WHERE id=NEW.router_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'PPPoE router tenant mismatch') END;
END;

-- expires_at and renewed_at are already introduced by migration 002.
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_customer_status ON subscriptions(tenant_id,customer_id,status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry ON subscriptions(tenant_id,status,expires_at);
