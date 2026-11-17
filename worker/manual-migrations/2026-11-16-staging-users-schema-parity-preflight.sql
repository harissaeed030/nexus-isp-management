-- READ-ONLY PREFLIGHT for the staging-only users schema parity rebuild.
-- Target nexus-saas-staging-db ONLY. Run before exporting/rehearsing migration.
-- Every result row must have issue_count = 0. Any non-zero result blocks migration.
-- This script performs SELECTs only; it does not modify data or schema.

SELECT 'users_with_null_password_hash' AS check_name, COUNT(*) AS issue_count
FROM users WHERE password_hash IS NULL
UNION ALL
SELECT 'duplicate_exact_global_emails', COUNT(*)
FROM (
  SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'duplicate_case_insensitive_emails_within_org', COUNT(*)
FROM (
  SELECT organization_id, lower(email) AS normalized_email
  FROM users GROUP BY organization_id, lower(email) HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'users_with_missing_organization', COUNT(*)
FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
WHERE o.id IS NULL
UNION ALL
SELECT 'sessions_with_missing_user', COUNT(*)
FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'password_resets_with_missing_user', COUNT(*)
FROM password_resets p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'notifications_with_missing_user', COUNT(*)
FROM notifications n LEFT JOIN users u ON u.id = n.user_id
WHERE n.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'tickets_with_missing_assignee', COUNT(*)
FROM support_tickets t LEFT JOIN users u ON u.id = t.assigned_to
WHERE t.assigned_to IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'ticket_messages_with_missing_user', COUNT(*)
FROM ticket_messages m LEFT JOIN users u ON u.id = m.user_id
WHERE m.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'existing_schema_migration_24_rows', COUNT(*)
FROM schema_migrations WHERE id = 24 OR name = '0024_users_strict_schema_parity';
