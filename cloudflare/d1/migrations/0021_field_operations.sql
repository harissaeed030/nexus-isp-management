-- NEXUS D1 field operations schema (tenant isolated)
CREATE TABLE IF NOT EXISTS geo_locations (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, parent_id TEXT,
 type TEXT NOT NULL CHECK(type IN ('country','city','locality','street')),
 name TEXT NOT NULL, postal_code TEXT, created_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(parent_id) REFERENCES geo_locations(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS coverage_areas (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT, description TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 UNIQUE(organization_id,name), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS connection_applications (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, application_no TEXT NOT NULL,
 full_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, coverage_area_id TEXT,
 package_id TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','approved','rejected','installed','cancelled')),
 created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 UNIQUE(organization_id,application_no), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(coverage_area_id) REFERENCES coverage_areas(id), FOREIGN KEY(package_id) REFERENCES packages(id)
);
CREATE TABLE IF NOT EXISTS business_partners (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, parent_partner_id TEXT,
 type TEXT NOT NULL DEFAULT 'dealer' CHECK(type IN ('dealer','sub_dealer')), name TEXT NOT NULL,
 phone TEXT, address TEXT, commission_percent REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT(datetime('now')), UNIQUE(organization_id,name),
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(parent_partner_id) REFERENCES business_partners(id)
);
CREATE TABLE IF NOT EXISTS recovery_officers (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT, name TEXT NOT NULL, phone TEXT,
 area_id TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT(datetime('now')),
 UNIQUE(organization_id,user_id), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(area_id) REFERENCES coverage_areas(id)
);
CREATE TABLE IF NOT EXISTS field_assignments (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, application_id TEXT, customer_id TEXT,
 technician_user_id TEXT NOT NULL, scheduled_at TEXT, notes TEXT,
 status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(application_id) REFERENCES connection_applications(id), FOREIGN KEY(customer_id) REFERENCES customers(id),
 FOREIGN KEY(technician_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS cash_collections (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0),
 method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank','jazzcash','easypaisa','other')),
 operator_user_id TEXT NOT NULL, recovery_officer_id TEXT, partner_id TEXT, reference TEXT, notes TEXT,
 received_at TEXT NOT NULL DEFAULT(datetime('now')), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(operator_user_id) REFERENCES users(id),
 FOREIGN KEY(recovery_officer_id) REFERENCES recovery_officers(id), FOREIGN KEY(partner_id) REFERENCES business_partners(id)
);
CREATE TABLE IF NOT EXISTS payment_promises (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0), promise_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','kept','broken','cancelled')),
 notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now')), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS inventory_items (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, sku TEXT, name TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('onu','media_box','router','fiber','splitter','other')),
 unit TEXT NOT NULL DEFAULT 'pcs', quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
 reorder_level INTEGER NOT NULL DEFAULT 0 CHECK(reorder_level>=0), location TEXT, serial_number TEXT,
 status TEXT NOT NULL DEFAULT 'available', created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now')), UNIQUE(organization_id,sku),
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL,
 movement_type TEXT NOT NULL CHECK(movement_type IN ('stock_in','stock_out','adjustment','assigned')),
 reference TEXT, notes TEXT, actor_user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(item_id) REFERENCES inventory_items(id), FOREIGN KEY(actor_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS customer_ledger_entries (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 entry_type TEXT NOT NULL CHECK(entry_type IN ('credit','debit')), amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0),
 description TEXT NOT NULL, reference_type TEXT, reference_id TEXT, actor_user_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(datetime('now')), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(actor_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ops_assignments_org ON field_assignments(organization_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ops_applications_org ON connection_applications(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_ops_collections_org ON cash_collections(organization_id,received_at);
CREATE INDEX IF NOT EXISTS idx_ops_promises_org ON payment_promises(organization_id,promise_date,status);
CREATE INDEX IF NOT EXISTS idx_ops_inventory_org ON inventory_items(organization_id,name);
CREATE INDEX IF NOT EXISTS idx_ops_ledger_customer ON customer_ledger_entries(organization_id,customer_id,created_at);
INSERT INTO schema_migrations(version,name,applied_at) VALUES(21,'0021_field_operations',datetime('now'));
