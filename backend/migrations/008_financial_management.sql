-- Migration 008: additive financial lifecycle tables.
-- Renumbered from the conflicting 002_financial_management identifier.
CREATE TABLE IF NOT EXISTS invoice_sequences(
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 billing_period TEXT NOT NULL,
 last_number INTEGER NOT NULL DEFAULT 0 CHECK(last_number>=0),
 PRIMARY KEY(tenant_id,billing_period)
);
CREATE TABLE IF NOT EXISTS credit_notes(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 invoice_id TEXT NOT NULL REFERENCES invoices(id),
 amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0), reason TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_reversals(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 payment_id TEXT NOT NULL REFERENCES payments(id),
 amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0), reason TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS unallocated_payments(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 customer_id TEXT NOT NULL REFERENCES customers(id),
 amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0),
 method TEXT NOT NULL CHECK(method IN ('cash','bank','jazzcash','easypaisa','other')),
 reference TEXT, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 status TEXT NOT NULL DEFAULT 'unallocated' CHECK(status IN ('unallocated','allocated')),
 allocated_invoice_id TEXT REFERENCES invoices(id),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((status='unallocated' AND allocated_invoice_id IS NULL) OR (status='allocated' AND allocated_invoice_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_tenant_invoice ON credit_notes(tenant_id,invoice_id,created_at);
CREATE INDEX IF NOT EXISTS idx_reversals_tenant_payment ON payment_reversals(tenant_id,payment_id,created_at);
CREATE INDEX IF NOT EXISTS idx_unallocated_tenant_status ON unallocated_payments(tenant_id,status,received_at);
CREATE TRIGGER IF NOT EXISTS trg_credit_note_tenant_insert BEFORE INSERT ON credit_notes BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'credit note invoice tenant mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'credit note actor tenant mismatch') END;
 SELECT CASE WHEN NEW.amount_pkr + COALESCE((SELECT SUM(amount_pkr) FROM credit_notes WHERE invoice_id=NEW.invoice_id),0) > COALESCE((SELECT amount_pkr FROM invoices WHERE id=NEW.invoice_id),0) THEN RAISE(ABORT,'credit notes exceed invoice total') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_credit_notes_immutable_update BEFORE UPDATE ON credit_notes BEGIN SELECT RAISE(ABORT,'credit notes are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_credit_notes_immutable_delete BEFORE DELETE ON credit_notes BEGIN SELECT RAISE(ABORT,'credit notes are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_reversal_tenant_insert BEFORE INSERT ON payment_reversals BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payments WHERE id=NEW.payment_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'reversal payment tenant mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'reversal actor tenant mismatch') END;
 SELECT CASE WHEN NEW.amount_pkr + COALESCE((SELECT SUM(amount_pkr) FROM payment_reversals WHERE payment_id=NEW.payment_id),0) > COALESCE((SELECT amount_pkr FROM payments WHERE id=NEW.payment_id),0) THEN RAISE(ABORT,'reversals exceed payment amount') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_reversals_immutable_update BEFORE UPDATE ON payment_reversals BEGIN SELECT RAISE(ABORT,'payment reversals are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_reversals_immutable_delete BEFORE DELETE ON payment_reversals BEGIN SELECT RAISE(ABORT,'payment reversals are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_unallocated_tenant_insert BEFORE INSERT ON unallocated_payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'unallocated payment customer tenant mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'unallocated payment actor tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_unallocated_allocation_update BEFORE UPDATE ON unallocated_payments
WHEN OLD.status='allocated' OR NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.customer_id<>OLD.customer_id OR NEW.amount_pkr<>OLD.amount_pkr OR NEW.method<>OLD.method OR COALESCE(NEW.reference,'')<>COALESCE(OLD.reference,'') OR NEW.received_at<>OLD.received_at OR NEW.created_by<>OLD.created_by
BEGIN SELECT RAISE(ABORT,'unallocated payment allocation is immutable'); END;
DROP TRIGGER IF EXISTS trg_payments_balance_insert;
DROP TRIGGER IF EXISTS trg_payments_balance_update;
CREATE TRIGGER trg_payments_balance_insert BEFORE INSERT ON payments BEGIN
 SELECT CASE WHEN NEW.amount_pkr + COALESCE((SELECT SUM(amount_pkr) FROM payments WHERE invoice_id=NEW.invoice_id),0)
   - COALESCE((SELECT SUM(r.amount_pkr) FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=NEW.invoice_id),0)
   > COALESCE((SELECT amount_pkr FROM invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id),-1)
     - COALESCE((SELECT SUM(amount_pkr) FROM credit_notes WHERE invoice_id=NEW.invoice_id AND tenant_id=NEW.tenant_id),0)
 THEN RAISE(ABORT,'payment exceeds adjusted invoice balance') END;
 SELECT CASE WHEN NEW.method NOT IN ('cash','bank','jazzcash','easypaisa','other') THEN RAISE(ABORT,'unsupported payment method') END;
END;
CREATE TRIGGER trg_payments_balance_update BEFORE UPDATE OF tenant_id,invoice_id,amount_pkr,method ON payments BEGIN
 SELECT CASE WHEN NEW.amount_pkr + COALESCE((SELECT SUM(amount_pkr) FROM payments WHERE invoice_id=NEW.invoice_id AND id<>OLD.id),0)
   - COALESCE((SELECT SUM(r.amount_pkr) FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=NEW.invoice_id),0)
   > COALESCE((SELECT amount_pkr FROM invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id),-1)
     - COALESCE((SELECT SUM(amount_pkr) FROM credit_notes WHERE invoice_id=NEW.invoice_id AND tenant_id=NEW.tenant_id),0)
 THEN RAISE(ABORT,'payment exceeds adjusted invoice balance') END;
 SELECT CASE WHEN NEW.method NOT IN ('cash','bank','jazzcash','easypaisa','other') THEN RAISE(ABORT,'unsupported payment method') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_unallocated_immutable_delete BEFORE DELETE ON unallocated_payments BEGIN SELECT RAISE(ABORT,'unallocated payment records are retained for audit'); END;
CREATE TRIGGER IF NOT EXISTS trg_unallocated_invoice_tenant_update
BEFORE UPDATE OF status,allocated_invoice_id ON unallocated_payments
WHEN NEW.status='allocated'
BEGIN
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM invoices WHERE id=NEW.allocated_invoice_id
   AND tenant_id=NEW.tenant_id AND customer_id=NEW.customer_id
 ) THEN RAISE(ABORT,'allocated invoice tenant or customer mismatch') END;
END;
