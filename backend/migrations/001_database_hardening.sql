-- Migration 001: harden tenant relationships and hot-path indexes.
-- Safe for existing 0.2.0 databases: additive indexes/triggers only; no rows or tables are dropped.

CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_customer_status ON subscriptions(tenant_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_customer ON invoices(tenant_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_invoice_received ON payments(tenant_id, invoice_id, received_at);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_customer ON support_tickets(tenant_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_runs_tenant_period ON billing_runs(tenant_id, billing_period);

CREATE TRIGGER IF NOT EXISTS trg_subscriptions_tenant_insert
BEFORE INSERT ON subscriptions BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'subscription customer tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM packages WHERE id=NEW.package_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'subscription package tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_subscriptions_tenant_update
BEFORE UPDATE OF tenant_id,customer_id,package_id ON subscriptions BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'subscription customer tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM packages WHERE id=NEW.package_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'subscription package tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_invoices_tenant_insert
BEFORE INSERT ON invoices BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'invoice customer tenant mismatch') END;
  SELECT CASE WHEN NEW.amount_pkr < 0 THEN RAISE(ABORT,'invoice amount must be non-negative') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_invoices_tenant_update
BEFORE UPDATE OF tenant_id,customer_id,amount_pkr ON invoices BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'invoice customer tenant mismatch') END;
  SELECT CASE WHEN NEW.amount_pkr < 0 THEN RAISE(ABORT,'invoice amount must be non-negative') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_tenant_insert
BEFORE INSERT ON payments BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'payment invoice tenant mismatch') END;
  SELECT CASE WHEN NEW.amount_pkr <= 0 THEN RAISE(ABORT,'payment amount must be positive') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_payments_tenant_update
BEFORE UPDATE OF tenant_id,invoice_id,amount_pkr ON payments BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'payment invoice tenant mismatch') END;
  SELECT CASE WHEN NEW.amount_pkr <= 0 THEN RAISE(ABORT,'payment amount must be positive') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_tickets_tenant_insert
BEFORE INSERT ON support_tickets BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'ticket customer tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_tickets_tenant_update
BEFORE UPDATE OF tenant_id,customer_id ON support_tickets BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'ticket customer tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_permissions_tenant_insert
BEFORE INSERT ON user_permissions BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'permission user tenant mismatch') END;
  SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'permission actor tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_permissions_tenant_update
BEFORE UPDATE OF tenant_id,user_id,updated_by ON user_permissions BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'permission user tenant mismatch') END;
  SELECT CASE WHEN NEW.updated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.updated_by AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'permission actor tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_billing_runs_actor_insert
BEFORE INSERT ON billing_runs WHEN NEW.created_by IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'billing actor tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_audit_actor_insert
BEFORE INSERT ON audit_logs WHEN NEW.actor_user_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_user_id AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'audit actor tenant mismatch') END;
END;
