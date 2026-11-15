# Manual D1 migrations

These SQL files are deliberately kept separate from automatic deployment configuration.

## 2026-11-14 — user email uniqueness per ISP workspace

The staging Worker registration and login paths support the same owner email in separate ISP organizations. The legacy D1 `users.email UNIQUE` constraint blocks that business rule at the database layer.

The migration replaces global email uniqueness with a case-insensitive unique index on `(organization_id, lower(email))`.

### D1-safe rebuild design

- No `PRAGMA foreign_keys = OFF` or `PRAGMA defer_foreign_keys` is used.
- Before rebuilding `users`, the migration copies all rows from `users` and each dependent table into temporary backup tables.
- It drops dependent tables first (`ticket_messages`, `support_tickets`, `notifications`, `sessions`, `password_resets`), then rebuilds `users`.
- It recreates dependent tables, restores their rows, indexes and organization-integrity triggers, and removes temporary backups.
- Existing user IDs and all dependent row IDs are preserved.

### Required rollout order

1. Export a fresh backup of the exact staging D1 database and retain its bookmark/export artifact.
2. Verify the target database name and ID independently. Never infer staging from a production `wrangler.toml`.
3. Test the migration on a disposable D1 database restored from the staging backup.
4. Compare before/after row counts and representative IDs for `users`, `sessions`, `password_resets`, `notifications`, `support_tickets`, and `ticket_messages`.
5. Run `PRAGMA foreign_key_check`; it must return zero rows.
6. Verify a same-email registration succeeds in another workspace and a case-insensitive duplicate in the same workspace is rejected.
7. Only then apply to staging, deploy the matching staging Worker code, and run the complete staging E2E workflow.
8. Verify cleanup of both synthetic tenants and all existing dependent records before considering any production migration.

### Safety

- This migration is not wired into an automatic deployment.
- The SQLite test uses foreign keys enabled and checks dependent rows, but it is not a substitute for a disposable D1 restore test.
- Do not apply to production.
- If the D1-compatible restore test fails or any dependent row count/ID changes, stop and do not apply the migration to staging.
