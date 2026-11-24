-- NEXUS D1 migration 0013: dashboard subscription lifecycle status.
-- Apply only after migration 0012. Review schema_migrations and take a verified backup first.

ALTER TABLE subscriptions ADD COLUMN workspace_status TEXT NOT NULL DEFAULT 'active';

UPDATE subscriptions
SET workspace_status = CASE
  WHEN status IN ('active','suspended','cancelled','expired') THEN status
  ELSE 'active'
END;

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_workspace_status
  ON subscriptions(organization_id, workspace_status);

INSERT OR IGNORE INTO schema_migrations(id, name, applied_at)
VALUES (13, '0013_subscription_workspace_status', datetime('now'));
