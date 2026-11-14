# Manual D1 migrations

These SQL files are deliberately kept separate from automatic deployment configuration.

## 2026-11-14 — user email uniqueness per ISP workspace

The current worker registration/login code supports the same owner email in different ISP organizations. The legacy D1 `users.email UNIQUE` constraint prevents that behavior at the database layer.

The migration rebuilds the `users` table and replaces global email uniqueness with a case-insensitive unique index on `(organization_id, lower(email))`. It preserves user IDs and the existing user columns so dependent session, ticket, notification, and password-reset references remain valid.

### Required rollout order

1. Take a fresh backup of the disposable/staging D1 database.
2. Verify the target database name and ID independently. Do not infer a staging database from the production `wrangler.toml`.
3. Run `bash worker/scripts/test-users-email-migration.sh` locally or in CI.
4. Apply this SQL only to the verified staging D1 database using the approved staging procedure.
5. Verify `PRAGMA foreign_key_check` returns no rows.
6. Run the staging portal E2E workflow and confirm two workspaces can register the same email, ambiguous email-only login is rejected, and workspace-specific login succeeds.
7. Verify existing staff sessions and dependent rows behave as expected before considering any production migration.

### Safety

- This migration is not wired into a deploy workflow.
- Do not apply it to production as part of this PR.
- Do not apply it until a staging backup and disposable restore test are available.
- If the target D1 environment rejects `PRAGMA foreign_keys = OFF` or wraps the SQL in a transaction that prevents changing the pragma, stop. Do not improvise a production workaround; use a separately reviewed D1-compatible table-rebuild procedure.
