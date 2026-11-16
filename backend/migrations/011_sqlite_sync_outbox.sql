-- NEXUS local SQLite transactional outbox (sync contract v1).
-- Apply only through the backend migration runner; never against Cloudflare D1.
CREATE TABLE IF NOT EXISTS sync_outbox (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  entity TEXT NOT NULL CHECK(entity IN ('customer','package','subscription','invoice','payment')),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create','upsert')),
  contract_version INTEGER NOT NULL DEFAULT 1 CHECK(contract_version = 1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','inflight','synced','quarantined')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_due
  ON sync_outbox(state, next_attempt_at, sequence);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_tenant
  ON sync_outbox(tenant_id, state, sequence);

-- Trigger writes are part of the originating business transaction.
-- Only allowlisted, non-secret columns are copied into the durable event.
CREATE TRIGGER IF NOT EXISTS sync_outbox_customer_insert AFTER INSERT ON customers BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'customer',NEW.id,'create',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'customer_code',NEW.customer_code,'full_name',NEW.full_name,'phone',NEW.phone,'email',NEW.email,'address',NEW.address,'status',NEW.status,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_customer_update AFTER UPDATE ON customers BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'customer',NEW.id,'upsert',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'customer_code',NEW.customer_code,'full_name',NEW.full_name,'phone',NEW.phone,'email',NEW.email,'address',NEW.address,'status',NEW.status,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_package_insert AFTER INSERT ON packages BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'package',NEW.id,'create',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'name',NEW.name,'speed_down_mbps',NEW.speed_down_mbps,'speed_up_mbps',NEW.speed_up_mbps,'monthly_price_pkr',NEW.monthly_price_pkr,'status',NEW.status,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_package_update AFTER UPDATE ON packages BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'package',NEW.id,'upsert',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'name',NEW.name,'speed_down_mbps',NEW.speed_down_mbps,'speed_up_mbps',NEW.speed_up_mbps,'monthly_price_pkr',NEW.monthly_price_pkr,'status',NEW.status,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_subscription_insert AFTER INSERT ON subscriptions BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'subscription',NEW.id,'create',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'customer_id',NEW.customer_id,'package_id',NEW.package_id,'status',NEW.status,'started_at',NEW.started_at,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_subscription_update AFTER UPDATE ON subscriptions BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'subscription',NEW.id,'upsert',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'customer_id',NEW.customer_id,'package_id',NEW.package_id,'status',NEW.status,'started_at',NEW.started_at,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_invoice_insert AFTER INSERT ON invoices BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'invoice',NEW.id,'create',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'customer_id',NEW.customer_id,'invoice_number',NEW.invoice_number,'amount_pkr',NEW.amount_pkr,'due_date',NEW.due_date,'status',NEW.status,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_invoice_update AFTER UPDATE ON invoices BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'invoice',NEW.id,'upsert',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'customer_id',NEW.customer_id,'invoice_number',NEW.invoice_number,'amount_pkr',NEW.amount_pkr,'due_date',NEW.due_date,'status',NEW.status,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_outbox_payment_insert AFTER INSERT ON payments BEGIN
 INSERT INTO sync_outbox(operation_id,tenant_id,entity,entity_id,operation,payload_json)
 VALUES(lower(hex(randomblob(16))),NEW.tenant_id,'payment',NEW.id,'create',
 json_object('id',NEW.id,'tenant_id',NEW.tenant_id,'invoice_id',NEW.invoice_id,'amount_pkr',NEW.amount_pkr,'method',NEW.method,'reference',NEW.reference,'received_at',NEW.received_at));
END;
