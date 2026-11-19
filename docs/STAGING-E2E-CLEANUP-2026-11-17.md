# Staging E2E Cleanup Record — 2026-11-17

## Scope

This record documents cleanup of the two synthetic organizations left by failed staging portal E2E run `44019847485`.

Target database: `nexus-saas-staging-db` (Cloudflare D1 staging database).

Target organization slugs:

- `nexus-stage-44019847485-1-a`
- `nexus-stage-44019847485-1-b`

Target owner email addresses:

- `owner-44019847485-1-a@e2e.invalid`
- `owner-44019847485-1-b@e2e.invalid`

## Cleanup performed

The cleanup removed the two synthetic organizations and their associated test-only records. The following non-zero row counts were deleted:

| Table | Deleted rows |
| --- | ---: |
| organizations | 2 |
| users | 2 |
| customers | 2 |
| customer_portal_accounts | 1 |
| support_tickets | 1 |
| notifications | 1 |
| audit_log | 9 |

The cleanup also issued scoped deletes against related tables (including invoices, payments, subscriptions, sessions, device inventory, API keys, settings, and sync bookkeeping); those tables had no matching rows.

## Verification

A read-only post-cleanup verification returned zero remaining rows for:

- organizations (by exact IDs and slugs)
- users (by exact organization IDs and E2E owner emails)
- customers
- customer portal accounts
- support tickets
- notifications
- audit log
- sessions

## Safety boundaries

- Only the staging database `nexus-saas-staging-db` was modified.
- No production database was queried for deletion or modified.
- No Worker or Pages deployment was performed.
- No schema migration or secret change was performed.
- This was a one-time, explicitly approved cleanup of the two exact E2E test organizations, not a general tenant cleanup procedure.

## Follow-up

The staging portal E2E workflow remains manual-dispatch only until staging schema/deployment parity is resolved. The cleanup compatibility guard remains in the Worker source and CI checks.
