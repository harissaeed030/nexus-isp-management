# Production and Staging D1 Reconciliation

**Audit date:** 2026-11-17  
**Status:** Read-only audit complete; schema parity is not complete.  
**Safety:** This document records observations and a controlled remediation plan. It does not authorize or perform migrations, data copying, Worker deployment, or production changes.

## Databases inspected

The audit queried the D1 databases referenced by the NEXUS Wrangler configuration:

| Environment | Database | UUID |
|---|---|---|
| Production | `nexus-saas-db` | `ce88098b-bff4-4d06-a0df-7bf29622a085` |
| Staging | `nexus-saas-staging-db` | `194f62e2-2766-48ab-be17-81248610c0cd` |

The audit used read-only `SELECT` queries against `schema_migrations` and `sqlite_master`. No database rows or schema objects were changed.

## Observed schema state

Counts exclude SQLite internal objects and include the D1 `_cf_KV` table.

| Metric | Production | Staging |
|---|---:|---:|
| Tables | 34 | 50 |
| Indexes | 71 | 86 |
| Triggers | 28 | 32 |

The D1 database-list API returned `num_tables: 0` for these databases, so the counts above are from `sqlite_master`, not that metadata field.

### Migration ledger

Production records migration IDs **1–10, 12, 13, and 100**. Migration 11 and migrations 14–21 are not recorded in the production ledger. The timestamps for production migration 13 precede migration 12, so migration IDs alone must not be treated as proof of chronological application order.

Staging records migration IDs **1–21 and 100**.

Migration 100 is the separately named `sync_ledger_and_failures_tables` entry and should be reconciled as a legacy/manual ledger entry rather than assumed to be part of the numbered sequence.

## Schema differences that require module-level review

Staging contains tables absent from the production table list, including:

- Field operations: `field_assignments`, `recovery_officers`, `cash_collections`, `payment_promises`, `coverage_areas`, `geo_locations`, `business_partners`, `connection_applications`.
- Network operations: `network_connectors`, `network_jobs`, `router_customer_mappings`.
- TR-069: `acs_connections`, `tr069_devices`, `tr069_audit_logs`.
- Inventory: `inventory_items`, `inventory_movements`.

The production schema has a smaller set of tables and different index/trigger counts. Table counts alone do not establish column, constraint, index, trigger, or data compatibility.

## Required remediation sequence

1. Freeze production schema changes until the exact checked-in migration files, current Worker bindings, and live database ledgers are reconciled.
2. Produce a canonical schema diff for every table, column, foreign key, unique constraint, index, and trigger. Compare the live schemas with both the target branch and the candidate integration branch.
3. For each missing module, identify its exact migration dependency chain and the API/Worker code that requires it. Do not apply the entire staging migration sequence to production.
4. Make migrations additive and tenant-safe. Review backfills, uniqueness assumptions, encrypted credential handling, foreign-key behavior, and rollback/recovery options.
5. Back up production and validate the backup before any future production change. Rehearse the exact migration set on a disposable restore or staging copy with representative synthetic data.
6. Verify the application code and database contract against the migrated schema. Confirm tenant isolation and existing customer, invoice, payment, subscription, staff, router, and ONU records remain intact.
7. Only after review and a separate explicit production-change authorization should a production migration be scheduled and executed.

## Release gates

Production parity must not be claimed until all of the following are true:

- A canonical schema diff has zero unexplained differences.
- The numbered migration ledger is consistent and its application order is verified.
- Backend verification and Worker contract suites pass against the exact target commit.
- Tenant-isolation and credential-protection checks pass.
- Backup restore has been rehearsed successfully.
- The production deployment plan has a documented rollback/recovery procedure.

## Current conclusion

The two live D1 environments are **not schema-parity aligned**. Staging has 16 more tables, 15 more indexes, and 4 more triggers than production in this audit. This is a factual inventory, not a recommendation to copy staging wholesale. Production remains unchanged.
