-- Additive only: complaint numbers, staff assignment, resolution time and per-ticket history.
ALTER TABLE support_tickets ADD COLUMN ticket_number TEXT;
ALTER TABLE support_tickets ADD COLUMN assigned_to TEXT REFERENCES users(id);
ALTER TABLE support_tickets ADD COLUMN resolved_at TEXT;

UPDATE support_tickets SET ticket_number='TKT-'||printf('%06d',(
  SELECT COUNT(*) FROM support_tickets s2
  WHERE s2.tenant_id=support_tickets.tenant_id
    AND (s2.created_at<support_tickets.created_at OR (s2.created_at=support_tickets.created_at AND s2.rowid<=support_tickets.rowid))
)) WHERE ticket_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_tenant_number ON support_tickets(tenant_id,ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_assigned ON support_tickets(tenant_id,assigned_to,status);

CREATE TRIGGER IF NOT EXISTS trg_tickets_assign_number
AFTER INSERT ON support_tickets WHEN NEW.ticket_number IS NULL BEGIN
  UPDATE support_tickets SET ticket_number='TKT-'||printf('%06d',(
    SELECT COALESCE(MAX(CAST(substr(ticket_number,5) AS INTEGER)),0)+1 FROM support_tickets
    WHERE tenant_id=NEW.tenant_id AND id<>NEW.id AND ticket_number IS NOT NULL
  )) WHERE id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tickets_assignee_tenant_insert
BEFORE INSERT ON support_tickets WHEN NEW.assigned_to IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'ticket assignee tenant mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_tickets_assignee_tenant_update
BEFORE UPDATE OF assigned_to ON support_tickets WHEN NEW.assigned_to IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_to AND tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'ticket assignee tenant mismatch') END;
END;

CREATE TABLE IF NOT EXISTS ticket_history(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_history(tenant_id,ticket_id,created_at);
