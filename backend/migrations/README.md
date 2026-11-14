# Database migrations

The SQLite runtime applies numbered SQL migrations at startup, in ascending order, and records each successful migration in `schema_migrations`. Each migration runs in its own transaction. Never edit a migration after it has been applied; add a new numbered file instead.

Before applying a migration to a live database:

1. Stop writes / place the service in maintenance mode.
2. Create and integrity-check a backup with `npm run backup`.
3. Test the migration against a copy of the production database with customer-identifying values removed.
4. Apply it using `npm run migrate` (startup also applies pending migrations).
5. Verify `npm run verify`, health check and critical tenant-scoped workflows.
6. Keep the pre-migration backup until the rollback window closes.

SQLite DDL rollback is not always safely reversible. The recovery strategy is restore-from-backup, not an improvised reverse SQL script. Test restore procedures before any production release.
