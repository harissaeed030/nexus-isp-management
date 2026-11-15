-- Migration 007: Task 10 ISP business modules.
-- Renumbered from the conflicting 005_isp_business_modules identifier.
CREATE TABLE IF NOT EXISTS coverage_areas(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,name TEXT NOT NULL,code TEXT,description TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,name));
CREATE TABLE IF NOT EXISTS geo_locations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,parent_id TEXT,type TEXT NOT NULL CHECK(type IN ('country','city','locality','street')),name TEXT NOT NULL,postal_code TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(parent_id) REFERENCES geo_locations(id),UNIQUE(tenant_id,type,name,parent_id));
CREATE TABLE IF NOT EXISTS connection_applications(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,application_no TEXT NOT NULL,full_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,coverage_area_id TEXT,package_id TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','installed','cancelled')),notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,application_no),FOREIGN KEY(coverage_area_id) REFERENCES coverage_areas(id),FOREIGN KEY(package_id) REFERENCES packages(id));
CREATE TABLE IF NOT EXISTS field_assignments(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,application_id TEXT,customer_id TEXT,technician_user_id TEXT NOT NULL,scheduled_at TEXT,status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','completed','cancelled')),notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(application_id) REFERENCES connection_applications(id),FOREIGN KEY(customer_id) REFERENCES customers(id),FOREIGN KEY(technician_user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS business_partners(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,parent_partner_id TEXT,type TEXT NOT NULL CHECK(type IN ('dealer','sub_dealer')),name TEXT NOT NULL,phone TEXT,address TEXT,commission_percent REAL NOT NULL DEFAULT 0 CHECK(commission_percent BETWEEN 0 AND 100),status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(parent_partner_id) REFERENCES business_partners(id),UNIQUE(tenant_id,name));
CREATE TABLE IF NOT EXISTS recovery_officers(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,user_id TEXT,name TEXT NOT NULL,phone TEXT,area_id TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(area_id) REFERENCES coverage_areas(id),UNIQUE(tenant_id,user_id));
CREATE TABLE IF NOT EXISTS cash_collections(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,customer_id TEXT NOT NULL,amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0),method TEXT NOT NULL DEFAULT 'cash',operator_user_id TEXT,recovery_officer_id TEXT,partner_id TEXT,reference TEXT,notes TEXT,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(customer_id) REFERENCES customers(id),FOREIGN KEY(operator_user_id) REFERENCES users(id),FOREIGN KEY(recovery_officer_id) REFERENCES recovery_officers(id),FOREIGN KEY(partner_id) REFERENCES business_partners(id));
CREATE TABLE IF NOT EXISTS inventory_items(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,sku TEXT,name TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('onu','media_box','router','fiber','splitter','other')),unit TEXT NOT NULL DEFAULT 'pcs',quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),reorder_level INTEGER NOT NULL DEFAULT 0 CHECK(reorder_level>=0),location TEXT,serial_number TEXT,status TEXT NOT NULL DEFAULT 'available',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,sku));
CREATE TABLE IF NOT EXISTS inventory_movements(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,item_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity<>0),movement_type TEXT NOT NULL CHECK(movement_type IN ('stock_in','stock_out','adjustment','assigned')),reference TEXT,notes TEXT,actor_user_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(item_id) REFERENCES inventory_items(id),FOREIGN KEY(actor_user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS customer_notifications(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,customer_id TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'in_app' CHECK(channel IN ('in_app','sms','whatsapp','email')),subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed')),sent_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(customer_id) REFERENCES customers(id));
CREATE TABLE IF NOT EXISTS customer_ledger_entries(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,customer_id TEXT NOT NULL,entry_type TEXT NOT NULL CHECK(entry_type IN ('debit','credit')),amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0),description TEXT NOT NULL,reference_type TEXT,reference_id TEXT,actor_user_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(customer_id) REFERENCES customers(id),FOREIGN KEY(actor_user_id) REFERENCES users(id));
CREATE INDEX IF NOT EXISTS idx_coverage_tenant ON coverage_areas(tenant_id,status);
CREATE INDEX IF NOT EXISTS idx_geo_tenant_parent ON geo_locations(tenant_id,parent_id,type);
CREATE INDEX IF NOT EXISTS idx_applications_tenant_status ON connection_applications(tenant_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_status ON field_assignments(tenant_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_collections_tenant_operator ON cash_collections(tenant_id,operator_user_id,received_at);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_category ON inventory_items(tenant_id,category);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger_entries(tenant_id,customer_id,created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON customer_notifications(tenant_id,customer_id,created_at);
CREATE TRIGGER IF NOT EXISTS task10_application_tenant BEFORE INSERT ON connection_applications BEGIN
 SELECT CASE WHEN NEW.coverage_area_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM coverage_areas WHERE id=NEW.coverage_area_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'application area tenant mismatch') END;
 SELECT CASE WHEN NEW.package_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM packages WHERE id=NEW.package_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'application package tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_assignment_tenant BEFORE INSERT ON field_assignments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.technician_user_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'technician tenant mismatch') END;
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'assignment customer tenant mismatch') END;
 SELECT CASE WHEN NEW.application_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM connection_applications WHERE id=NEW.application_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'assignment application tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_collection_tenant BEFORE INSERT ON cash_collections BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'collection customer tenant mismatch') END;
 SELECT CASE WHEN NEW.operator_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.operator_user_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'collection operator tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_inventory_movement_tenant BEFORE INSERT ON inventory_movements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM inventory_items WHERE id=NEW.item_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'inventory movement tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_ledger_tenant BEFORE INSERT ON customer_ledger_entries BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'ledger customer tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_notification_tenant BEFORE INSERT ON customer_notifications BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'notification customer tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_geo_parent_tenant BEFORE INSERT ON geo_locations WHEN NEW.parent_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM geo_locations WHERE id=NEW.parent_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'geo parent tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_partner_parent_tenant BEFORE INSERT ON business_partners WHEN NEW.parent_partner_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM business_partners WHERE id=NEW.parent_partner_id AND tenant_id=NEW.tenant_id AND type='dealer') THEN RAISE(ABORT,'partner parent tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_officer_tenant BEFORE INSERT ON recovery_officers BEGIN
 SELECT CASE WHEN NEW.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'recovery user tenant mismatch') END;
 SELECT CASE WHEN NEW.area_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM coverage_areas WHERE id=NEW.area_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'recovery area tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS task10_collection_references_tenant BEFORE INSERT ON cash_collections BEGIN
 SELECT CASE WHEN NEW.recovery_officer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM recovery_officers WHERE id=NEW.recovery_officer_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'collection officer tenant mismatch') END;
 SELECT CASE WHEN NEW.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM business_partners WHERE id=NEW.partner_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'collection partner tenant mismatch') END;
END;
