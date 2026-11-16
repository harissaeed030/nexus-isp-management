-- Migration 012: durable, tenant-scoped change feed for SQLite -> D1.
-- The outbox stores identifiers only; business snapshots are read by the authenticated export API.
CREATE TABLE IF NOT EXISTS sync_outbox (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('customers','packages','subscriptions','invoices','payments')),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_tenant_cursor ON sync_outbox(tenant_id,cursor);

CREATE TABLE IF NOT EXISTS sync_state (
  state_key TEXT PRIMARY KEY,
  state_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS sync_customers_ai AFTER INSERT ON customers BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'customers',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_customers_au AFTER UPDATE ON customers BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'customers',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_customers_ad AFTER DELETE ON customers BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),OLD.tenant_id,'customers',OLD.id,'delete');
END;

CREATE TRIGGER IF NOT EXISTS sync_packages_ai AFTER INSERT ON packages BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'packages',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_packages_au AFTER UPDATE ON packages BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'packages',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_packages_ad AFTER DELETE ON packages BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),OLD.tenant_id,'packages',OLD.id,'delete');
END;

CREATE TRIGGER IF NOT EXISTS sync_subscriptions_ai AFTER INSERT ON subscriptions BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'subscriptions',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_subscriptions_au AFTER UPDATE ON subscriptions BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'subscriptions',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_subscriptions_ad AFTER DELETE ON subscriptions BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),OLD.tenant_id,'subscriptions',OLD.id,'delete');
END;

CREATE TRIGGER IF NOT EXISTS sync_invoices_ai AFTER INSERT ON invoices BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'invoices',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_invoices_au AFTER UPDATE ON invoices BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'invoices',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_invoices_ad AFTER DELETE ON invoices BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),OLD.tenant_id,'invoices',OLD.id,'delete');
END;

CREATE TRIGGER IF NOT EXISTS sync_payments_ai AFTER INSERT ON payments BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'payments',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_payments_au AFTER UPDATE ON payments BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'payments',NEW.id,'upsert');
END;
CREATE TRIGGER IF NOT EXISTS sync_payments_ad AFTER DELETE ON payments BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation) VALUES(lower(hex(randomblob(16))),OLD.tenant_id,'payments',OLD.id,'delete');
END;

-- One-time initial snapshot. This is safe to replay because each outbox event has a unique operation ID.
INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation)
 SELECT lower(hex(randomblob(16))),tenant_id,'customers',id,'upsert' FROM customers;
INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation)
 SELECT lower(hex(randomblob(16))),tenant_id,'packages',id,'upsert' FROM packages;
INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation)
 SELECT lower(hex(randomblob(16))),tenant_id,'subscriptions',id,'upsert' FROM subscriptions;
INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation)
 SELECT lower(hex(randomblob(16))),tenant_id,'invoices',id,'upsert' FROM invoices;
INSERT INTO sync_outbox(operation_id,tenant_id,entity_type,entity_id,operation)
 SELECT lower(hex(randomblob(16))),tenant_id,'payments',id,'upsert' FROM payments;
