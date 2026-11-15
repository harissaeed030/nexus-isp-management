-- D1 migration 0006: same-organization relationship guards and index alignment.
-- Additive; does not drop tables or business data. Run duplicate preflight first.

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at) VALUES
(1,'0001_saas_foundation','2026-11-10 12:44:49'),
(2,'0002_auth_sessions','2026-11-10 14:23:05'),
(3,'0003_isp_modules','2026-11-10 14:23:16'),
(4,'0004_add_missing_columns_and_tables','2026-11-12 17:51:19'),
(5,'0005_sync_staging_schema','2026-11-13 23:41:19');

DROP INDEX IF EXISTS idx_invoices_org_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_number ON invoices(organization_id,invoice_number);
DROP INDEX IF EXISTS idx_invoices_subscription_period;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_subscription_period ON invoices(organization_id,subscription_id,billing_period) WHERE subscription_id IS NOT NULL AND billing_period IS NOT NULL;
DROP INDEX IF EXISTS idx_payments_org_reference;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_org_reference ON payments(organization_id,transaction_ref) WHERE transaction_ref IS NOT NULL AND transaction_ref<>'';
DROP INDEX IF EXISTS idx_refunds_org_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_org_idempotency ON refunds(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key<>'';
DROP INDEX IF EXISTS idx_refunds_org_reference;
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_org_reference ON refunds(organization_id,reference) WHERE reference IS NOT NULL AND reference<>'';
DROP INDEX IF EXISTS idx_refunds_payment_status;
CREATE INDEX IF NOT EXISTS idx_refunds_payment_status ON refunds(organization_id,payment_id,status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_customer_package ON subscriptions(organization_id,customer_id,package_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_customer_subscription ON invoices(organization_id,customer_id,subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_invoice_customer ON payments(organization_id,invoice_id,customer_id);
CREATE INDEX IF NOT EXISTS idx_pppoe_org_customer ON pppoe_accounts(organization_id,customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_org_customer_assignee ON support_tickets(organization_id,customer_id,assigned_to);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_user ON ticket_messages(ticket_id,user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_org_user ON user_permissions(organization_id,user_id);
CREATE INDEX IF NOT EXISTS idx_onu_org_customer_olt ON onu_devices(organization_id,customer_id,olt_device_id);

CREATE TRIGGER IF NOT EXISTS trg_d1_sub_org_i BEFORE INSERT ON subscriptions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM packages WHERE id=NEW.package_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription package organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_sub_org_u BEFORE UPDATE OF organization_id,customer_id,package_id ON subscriptions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM packages WHERE id=NEW.package_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'subscription package organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_invoice_org_i BEFORE INSERT ON invoices BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'invoice customer organization mismatch') END;
 SELECT CASE WHEN NEW.subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND organization_id=NEW.organization_id AND customer_id=NEW.customer_id) THEN RAISE(ABORT,'invoice subscription organization/customer mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_invoice_org_u BEFORE UPDATE OF organization_id,customer_id,subscription_id ON invoices BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'invoice customer organization mismatch') END;
 SELECT CASE WHEN NEW.subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE id=NEW.subscription_id AND organization_id=NEW.organization_id AND customer_id=NEW.customer_id) THEN RAISE(ABORT,'invoice subscription organization/customer mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_payment_org_i BEFORE INSERT ON payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices i JOIN customers c ON c.id=NEW.customer_id WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.customer_id=NEW.customer_id AND c.organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment invoice/customer organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_payment_org_u BEFORE UPDATE OF organization_id,invoice_id,customer_id ON payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices i JOIN customers c ON c.id=NEW.customer_id WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.customer_id=NEW.customer_id AND c.organization_id=NEW.organization_id) THEN RAISE(ABORT,'payment invoice/customer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_pppoe_org_i BEFORE INSERT ON pppoe_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'PPPoE customer organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_pppoe_org_u BEFORE UPDATE OF organization_id,customer_id ON pppoe_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'PPPoE customer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_ticket_org_i BEFORE INSERT ON support_tickets BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END;
 SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_ticket_org_u BEFORE UPDATE OF organization_id,customer_id,assigned_to ON support_tickets BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket customer organization mismatch') END;
 SELECT CASE WHEN NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ticket assignee organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_message_org_i BEFORE INSERT ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_message_org_u BEFORE UPDATE OF ticket_id,user_id ON ticket_messages WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM support_tickets t JOIN users u ON u.id=NEW.user_id WHERE t.id=NEW.ticket_id AND t.organization_id=u.organization_id) THEN RAISE(ABORT,'ticket message user organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_permission_org_i BEFORE INSERT ON user_permissions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission user organization mismatch') END;
 SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission actor organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_permission_org_u BEFORE UPDATE OF organization_id,user_id,updated_by ON user_permissions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission user organization mismatch') END;
 SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'permission actor organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_onu_org_i BEFORE INSERT ON onu_devices BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU customer organization mismatch') END;
 SELECT CASE WHEN NEW.olt_device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.olt_device_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU OLT organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_onu_org_u BEFORE UPDATE OF organization_id,customer_id,olt_device_id ON onu_devices BEGIN
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU customer organization mismatch') END;
 SELECT CASE WHEN NEW.olt_device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM network_devices WHERE id=NEW.olt_device_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'ONU OLT organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_refund_org_i BEFORE INSERT ON refunds BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payments p JOIN invoices i ON i.id=NEW.invoice_id JOIN customers c ON c.id=NEW.customer_id WHERE p.id=NEW.payment_id AND p.organization_id=NEW.organization_id AND i.organization_id=NEW.organization_id AND c.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id AND p.customer_id=NEW.customer_id AND i.customer_id=NEW.customer_id) THEN RAISE(ABORT,'refund payment/invoice/customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund creator organization mismatch') END;
 SELECT CASE WHEN NEW.completed_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.completed_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund completer organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_refund_org_u BEFORE UPDATE OF organization_id,payment_id,invoice_id,customer_id,created_by,completed_by ON refunds BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payments p JOIN invoices i ON i.id=NEW.invoice_id JOIN customers c ON c.id=NEW.customer_id WHERE p.id=NEW.payment_id AND p.organization_id=NEW.organization_id AND i.organization_id=NEW.organization_id AND c.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id AND p.customer_id=NEW.customer_id AND i.customer_id=NEW.customer_id) THEN RAISE(ABORT,'refund payment/invoice/customer organization mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund creator organization mismatch') END;
 SELECT CASE WHEN NEW.completed_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.completed_by AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'refund completer organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_notification_org_i BEFORE INSERT ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_notification_org_u BEFORE UPDATE OF organization_id,user_id ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'notification user organization mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_d1_audit_org_i BEFORE INSERT ON audit_log WHEN NEW.organization_id IS NOT NULL AND NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'audit actor organization mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_d1_audit_org_u BEFORE UPDATE OF organization_id,user_id ON audit_log WHEN NEW.organization_id IS NOT NULL AND NEW.user_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'audit actor organization mismatch') END;
END;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at) VALUES(6,'0006_d1_tenant_integrity_guards',datetime('now'));
