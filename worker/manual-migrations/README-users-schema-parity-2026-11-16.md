# D1 users schema parity — migration 0011

## Target and decision

The live production users table is the strict reference schema. Staging currently has the same logical columns but weaker constraints and a different column order. The target is to make staging exactly match production without weakening production.

Live read-only preflight (2026-11-16):
- Production: 1 user; no null password hashes, blank emails, or blank roles.
- Staging: 7 users; no null password hashes, blank emails, or blank roles.
- Staging dependants: 0 sessions, 0 password resets, 1 notification, 1 support ticket, 0 ticket messages.
- Production dependants: all zero.
- Both databases currently record migrations through 0009.
- Production strict users DDL and required indexes were read directly from D1.

## Required order — do not skip

1. Export a fresh backup of the exact staging D1 database. Retain the export bookmark and file.
2. Restore that export into an isolated disposable D1 database.
3. Apply 2026-11-16-staging-users-strict-schema-parity.sql to the disposable restore only.
4. Compare before/after counts and IDs for users, sessions, password_resets, notifications, support_tickets and ticket_messages.
5. Verify the production-equivalent users DDL, all three indexes, all six organization-integrity triggers, and zero rows from PRAGMA foreign_key_check.
6. Run bash worker/scripts/test-d1-users-strict-schema-parity.sh.
7. Only after the disposable D1 restore passes, apply the staging migration to nexus-saas-staging-db, then run staging login, staff, notification, ticket and tenant-isolation E2E tests.
8. Finally apply 2026-11-16-production-users-schema-parity-ledger.sql to production. This is ledger-only: production users table is already the target schema and must not be rebuilt.
9. Re-read both DDL definitions and compare all schema objects. Both ledgers must show version 11; migration 0010 remains reserved for payment promises.

## Safety

- Never run the staging rebuild SQL against production.
- The staging migration copies user and dependent rows to temporary tables, drops dependent tables before users, recreates the strict production users definition, restores dependent rows/indexes/triggers, then removes temporary copies.
- It intentionally fails if a staged user has a NULL password hash or other data violates the production constraints. Do not weaken constraints to force it through.
- The production ledger SQL performs no table rebuild and no user-data writes.
- Do not deploy a Worker or merge this migration merely because the SQLite fixture test passes.
- If backup restore, row/ID comparison, trigger checks or foreign-key validation fail, stop and restore the disposable target; do not apply to live staging or production.

## Current status

Migration source and regression test are prepared in this PR. No live D1 database has been changed by this change set. A disposable D1 restore rehearsal and authorized live integrity/foreign-key validation remain mandatory before applying the migration.
