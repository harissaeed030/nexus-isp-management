-- TASK 07: secure RouterOS inventory and connection audit.
ALTER TABLE routers ADD COLUMN credential_username TEXT;
ALTER TABLE routers ADD COLUMN credential_password TEXT;
ALTER TABLE customers ADD COLUMN pppoe_username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_pppoe ON customers(tenant_id,pppoe_username) WHERE pppoe_username IS NOT NULL;
CREATE TABLE IF NOT EXISTS router_connection_logs(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 router_id TEXT NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id),action TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('success','error')),detail TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_router_logs_tenant_router ON router_connection_logs(tenant_id,router_id,created_at);
