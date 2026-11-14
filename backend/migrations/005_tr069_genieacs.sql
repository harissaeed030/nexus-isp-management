CREATE TABLE IF NOT EXISTS acs_connections(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL,base_url TEXT NOT NULL,username_cipher TEXT,password_cipher TEXT,token_cipher TEXT,
 timeout_ms INTEGER NOT NULL DEFAULT 8000,enabled INTEGER NOT NULL DEFAULT 1,
 last_test_at TEXT,last_test_ok INTEGER,last_error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,name)
);
CREATE TABLE IF NOT EXISTS tr069_devices(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 acs_connection_id TEXT NOT NULL REFERENCES acs_connections(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL,manufacturer TEXT,oui TEXT,product_class TEXT,model TEXT,serial_number TEXT,
 last_inform_at TEXT,last_boot_at TEXT,inform_status TEXT NOT NULL DEFAULT 'unknown',
 parameter_snapshot TEXT NOT NULL DEFAULT '{}',last_synced_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,acs_connection_id,device_id)
);
CREATE TABLE IF NOT EXISTS tr069_audit_logs(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 actor_user_id TEXT,device_id TEXT,acs_connection_id TEXT,action TEXT NOT NULL,
 parameter_name TEXT,old_value TEXT,new_value TEXT,result TEXT NOT NULL,details TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_acs_tenant ON acs_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tr069_devices_tenant ON tr069_devices(tenant_id,last_inform_at);
CREATE INDEX IF NOT EXISTS idx_tr069_audit_tenant ON tr069_audit_logs(tenant_id,created_at);
