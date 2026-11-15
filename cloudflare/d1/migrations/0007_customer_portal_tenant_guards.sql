-- D1 migration 0007; staging only until customer portal routes are promoted.
CREATE TRIGGER IF NOT EXISTS trg_d1_portal_org_i BEFORE INSERT ON customer_portal_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'portal account customer organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_portal_org_u BEFORE UPDATE OF organization_id,customer_id ON customer_portal_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'portal account customer organization mismatch') END;
END;
INSERT OR IGNORE INTO schema_migrations(id,name,applied_at) VALUES(7,'0007_customer_portal_tenant_guards',datetime('now'));
