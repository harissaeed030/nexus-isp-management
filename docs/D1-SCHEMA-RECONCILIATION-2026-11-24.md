# NEXUS D1 schema reconciliation — 2026-11-24

## Why this exists

The deployed production and staging databases contain the same core ISP modules, but their migration ledgers and selected indexes drifted. The repository's `main` branch was missing the already-deployed migrations 0010–0021, so applying the directory blindly would be unsafe.

## Migration history restored

Migrations 0010–0021 are restored from the NEXUS core branch so the repository again records the deployed schema history. Do **not** replay 0010–0021 against the current production or staging databases: their effects already exist, and some files contain non-idempotent `ALTER TABLE ADD COLUMN` statements.

Staging's migration ledger uses the legacy label `0011_sync_staging_with_production` for ID 11, while production uses `0011_sqlite_sync_inbox`. Do not rewrite that historical label.

## Reconciliation sequence

After a fresh SQL export of both databases and successful preflight checks, apply these migrations in order:

1. `0022_payment_promises.sql` — compatible base definition and tenant-safe insert trigger. It intentionally does not add `updated_by`.
2. `0023_router_credentials_ciphertext.sql` — creates the encrypted RouterOS credential table and tenant guards. It does not enable live router commands.
3. `0024_reconcile_deployed_schema_drift.sql` — aligns sync/network indexes, adds the missing `sync_state` table to staging, and removes the global users-email unique index. Per-organization case-insensitive uniqueness remains enforced.
4. `0025_payment_promises_updated_by_guard.sql` — adds `updated_by` and the payment-promise update tenant guard.

## Required preflight

Before 0024, both queries must return zero rows:

```sql
SELECT tenant_id, table_name, record_id, COUNT(*)
FROM sync_records
GROUP BY tenant_id, table_name, record_id
HAVING COUNT(*) > 1;

SELECT organization_id, lower(email), COUNT(*)
FROM users
GROUP BY organization_id, lower(email)
HAVING COUNT(*) > 1;
```

The 2026-11-24 read-only audit returned zero duplicates in both databases. The staging database also had zero synthetic test workspaces after cleanup.

## Known accepted differences

- Production `users.password_hash` is NOT NULL; staging has an insert/update trigger that rejects empty hashes. Do not rebuild either populated users table as part of this reconciliation.
- Production and staging have different default values for `users.role` and `users.id`; the application supplies these values explicitly during owner/staff creation. This needs a separate schema-normalization plan.
- Existing `payment_promises` tables are present in both databases but predate the new `updated_by` column; migrations 0022 and 0025 deliberately handle this in two steps.
- The separate `router_credentials` table is not yet present in either database. Migration 0023 creates it; network connector execution remains disabled until real device integration is separately tested.

## Safety boundaries

- Never apply these migrations to production before the staging rehearsal, backup verification, and full CI/live-smoke checks pass.
- Do not enable `NETWORK_CONNECTOR_ENABLED` as part of schema work.
- Do not run RouterOS writes, PPPoE changes, OLT writes, or ONU configuration as part of this release.

## Operational sequencing

D1 SQL exports can temporarily make the database reject Worker queries with `Currently processing a long-running export`. Finish and poll exports to `complete` before starting staging E2E or live-smoke workflows; otherwise tests can fail for a transient maintenance lock and leave synthetic tenants to clean up.
