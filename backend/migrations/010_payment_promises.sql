CREATE TABLE IF NOT EXISTS payment_promises(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customers(id),
 amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0),
 promise_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','kept','broken','cancelled')),
 notes TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payment_promises_tenant_date ON payment_promises(tenant_id,status,promise_date);
CREATE TRIGGER IF NOT EXISTS trg_payment_promises_tenant_insert BEFORE INSERT ON payment_promises BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'payment promise customer tenant mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'payment promise actor tenant mismatch') END;
END;
