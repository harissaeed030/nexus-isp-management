-- TASK 05: additive customer and subscription management schema.
ALTER TABLE customers ADD COLUMN account_number TEXT;
ALTER TABLE customers ADD COLUMN service_address TEXT;
ALTER TABLE customers ADD COLUMN coverage_area TEXT;
ALTER TABLE customers ADD COLUMN installation_date TEXT;
ALTER TABLE customers ADD COLUMN connection_status TEXT NOT NULL DEFAULT 'pending';
UPDATE customers SET account_number=customer_code WHERE account_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_account_number ON customers(tenant_id,account_number);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_status_name ON customers(tenant_id,status,full_name);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_area ON customers(tenant_id,coverage_area);
ALTER TABLE subscriptions ADD COLUMN expires_at TEXT;
ALTER TABLE subscriptions ADD COLUMN renewed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_expiry ON subscriptions(tenant_id,expires_at,status);
CREATE TABLE IF NOT EXISTS tenant_customer_sequences(
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 next_value INTEGER NOT NULL DEFAULT 1 CHECK(next_value>0)
);
CREATE TABLE IF NOT EXISTS subscription_history(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL, old_value TEXT, new_value TEXT, notes TEXT,
 actor_user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customer_connection_history(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL, old_status TEXT, new_status TEXT, notes TEXT,
 actor_user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscription_history_customer ON subscription_history(tenant_id,customer_id,created_at);
CREATE INDEX IF NOT EXISTS idx_connection_history_customer ON customer_connection_history(tenant_id,customer_id,created_at);
CREATE TRIGGER IF NOT EXISTS trg_subscription_history_tenant_insert
BEFORE INSERT ON subscription_history BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM subscriptions s JOIN customers c ON c.id=s.customer_id
   WHERE s.id=NEW.subscription_id AND s.tenant_id=NEW.tenant_id AND c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'subscription history tenant mismatch') END;
 SELECT CASE WHEN NEW.actor_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_user_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'subscription history actor tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_connection_history_tenant_insert
BEFORE INSERT ON customer_connection_history BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'connection history tenant mismatch') END;
 SELECT CASE WHEN NEW.actor_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_user_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'connection history actor tenant mismatch') END;
END;
