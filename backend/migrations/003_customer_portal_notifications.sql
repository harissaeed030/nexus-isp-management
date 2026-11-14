-- TASK 11: customer portal accounts, isolated sessions and notification outbox.
CREATE TABLE IF NOT EXISTS customer_portal_accounts(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
 last_login_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,customer_id)
);
CREATE TABLE IF NOT EXISTS customer_portal_sessions(
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES customer_portal_accounts(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expiry ON customer_portal_sessions(expires_at);
CREATE TABLE IF NOT EXISTS notification_templates(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL, event_key TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'whatsapp',
 body TEXT NOT NULL, provider_template_name TEXT, language_code TEXT NOT NULL DEFAULT 'en_US', enabled INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,event_key,channel)
);
CREATE TABLE IF NOT EXISTS notification_outbox(
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
 template_id TEXT REFERENCES notification_templates(id) ON DELETE SET NULL,
 channel TEXT NOT NULL, destination TEXT NOT NULL, body TEXT NOT NULL,
 provider_template_name TEXT, language_code TEXT, template_parameters TEXT,
 status TEXT NOT NULL DEFAULT 'queued', provider_message_id TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5,
 next_attempt_at TEXT, last_error TEXT, provider_status TEXT,
 sent_at TEXT, delivered_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_tenant_status ON notification_outbox(tenant_id,status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_customer ON notification_outbox(tenant_id,customer_id,created_at);
CREATE TRIGGER IF NOT EXISTS trg_portal_account_tenant_insert BEFORE INSERT ON customer_portal_accounts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
 THEN RAISE(ABORT,'portal account tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_portal_session_tenant_insert BEFORE INSERT ON customer_portal_sessions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customer_portal_accounts WHERE id=NEW.account_id)
 THEN RAISE(ABORT,'portal session account missing') END;
END;
