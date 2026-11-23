# Cloudflare D1 schema and migrations

## New source migration — 0022 payment promises (not applied)

The repository now contains additive migration `0022_payment_promises.sql` plus a canonical schema snapshot update. It creates the tenant-scoped payment-promises table, indexes and customer/actor integrity triggers. The Worker source includes the matching API and an idempotent runtime bootstrap for this table.

**This migration has not been applied to production or staging.** The 2026-11-19 live audit found divergent migration ledgers (production includes 10, 12, 13, 100 and 101; staging includes 1–21 and 100). Before any deployment, take fresh exports, confirm whether the table/indexes/triggers already exist in each database, rehearse the SQL against disposable copies, and reconcile the existing ledgers. Do not assume the migration number is a linear upgrade state or run it blindly.


## Live state recheck — 2026-11-19

This section supersedes any statement above that both live databases currently have identical migration ledgers or that the global email index is present in both environments. The earlier sections describe the historical 2026-11-15 release and backup record; they are not a current parity certificate.

A read-only Cloudflare D1 recheck on 2026-11-19 observed:

| Check | Production | Staging |
|---|---|---|
| Recorded migration IDs | 1–10, 12, 13, 100, 101 | 1–21, 100 |
| `users.password_hash` | NOT NULL | nullable |
| `users.role` default | `staff` | `member` |
| `idx_users_email_global` | present | absent |
| `PRAGMA foreign_key_check` | 0 violations | 0 violations |

The production-only ledger entry 101 is `2026-11-17-staging-schema-additive-reconcile`. Staging-only entries are 11 and 14–21. A ledger difference alone does not prove every schema object differs, but the ledger histories are not currently a shared, linear upgrade path.

The staging users table currently has organization-scoped email indexes but does not have the global unique email index. This conflicts with the earlier migration 0009 verification narrative and with production's current global-unique-email index. Do not run migration 0009 or the manual users parity rebuild against either live database until the intended account identity policy is decided and a fresh duplicate-email preflight is completed.

The checked-in manual users parity migration and fixture also require a refreshed rehearsal. The live staging database currently contains 128 `notifications` rows and 127 `support_tickets` rows; the documented fixture/preflight was based on one row in each. The live schema has 15 tables with foreign-key references to `users`, while the manual parity script explicitly snapshots/recreates only a subset of dependent tables. Its preconditions must be expanded to assert all dependent tables, rows, indexes, triggers, and foreign keys before any migration is considered.

### Required reconciliation gate

1. Export current production and staging databases again; restore staging into a disposable D1 database for the rehearsal.
2. Capture exact row counts and primary-key sets for every users-referencing table, plus dependent indexes, triggers, and foreign keys.
3. Decide and document whether email uniqueness is global or tenant/workspace scoped; test login, invitations, and tenant isolation for that model.
4. Reconcile migration ledgers 1–21/100/101 into a documented forward-only plan without rewriting applied migration IDs.
5. Update the migration registry, schema snapshots, tests, and this README only after the disposable rehearsal passes.

No live migration was performed as part of this recheck. All queries were read-only and reported zero rows written. Production and staging data, Workers, secrets, and live network devices were not modified.


## Databases

- Production: `nexus-saas-db` (`ce88098b-bff4-4d06-a0df-7bf29622a085`)
- Staging: `nexus-saas-staging-db` (`194f62e2-2766-48ab-be17-81248610c0cd`)

## Current state after the 2026-11-15 release

Both production and staging are at D1 schema migration 0009. Migration 0009 repaired the missing explicit global user-email index in production.

- Production migration 0007 was applied after a full D1 export.
- `customer_portal_accounts` exists in both databases.
- Both tenant-integrity triggers (`trg_d1_portal_org_i`, `trg_d1_portal_org_u`) exist in both databases.
- Migration 0008 is recorded in both databases. A follow-up live recheck found the explicit global email index absent in production, while staging already had it. A duplicate-email preflight returned no conflicts in either database. Migration 0009 has now been applied to both environments; live verification confirmed the global email unique index, case-insensitive organization email unique index, and organization lookup index in both.
- A live object comparison found 99 schema objects in each database. All indexes, triggers, and tables except the users table have matching normalized definitions. The users table has a legacy production definition with stricter NOT NULL password hash, staff default role, and no generated ID default; staging has the canonical member default, nullable password hash, and generated ID default. This remaining table-shape difference is documented in docs/D1-LIVE-SCHEMA-AUDIT-2026-11-15.md; no risky production table rebuild was attempted.
- Production records were preserved. At release verification, production had 1 organization, 1 owner user, 0 customers, 0 invoices, 0 payments and 0 customer portal accounts.
- The production Worker is deployed at version 25 (100% traffic); staging Worker version 18 is also deployed with the same logging-redaction patch.

The SQL artifacts for migrations 0001-0005 are not present in the current repository history. Their applied names and timestamps are recorded in each database's `schema_migrations` table. Do not invent replacement historical migrations or rerun them. `worker/schema.sql` is the canonical full snapshot for creating a fresh database at schema version 0009.

## Runtime boundary

The local Node/SQLite backend is a separate offline development runtime, not a D1 replica. See [the database architecture reconciliation](../../docs/DATABASE-ARCHITECTURE-RECONCILIATION.md) before planning data movement. Do not import/export live production data through ad-hoc SQL or treat the schemas as interchangeable.

## Migration 0008

migrations/0008_user_email_index_parity.sql is additive and idempotent. It creates the organization lookup index, a global unique email index and a case-insensitive per-organization unique email index. It does not rebuild the users table or rewrite user records. It was applied to staging first and then production after duplicate preflight and fresh D1 exports. Both databases now record migration 8.

## Migration 0009

`migrations/0009_repair_global_user_email_index.sql` re-creates the missing explicit global unique index on `users(email)` and records version 9. It was applied to staging and production after fresh D1 exports and a no-duplicate preflight. Both databases now record version 9, and the expected index definition was verified live.

## Migration 0007

`migrations/0007_customer_portal_tenant_guards.sql` is additive and idempotent. It creates the customer portal account table, enforces that the account's customer belongs to the same organization on insert/update, and records migration 7. It does not drop or rewrite existing customer, invoice, payment or user records.

## Schema artifacts

- `worker/schema-production-v6.sql`: schema-only production baseline before migration 0007.
- worker/schema.sql: canonical full schema snapshot including additive source migration 0022; it is for empty databases only.
- worker/scripts/validate-d1-schema.py: validates the checked-in production-v6 snapshot through migration 0009, tenant guards and user email uniqueness. It is not a live database schema diff; consult the live audit report for actual production/staging comparison.

Use schema snapshots only for empty databases. Existing databases must be upgraded with incremental migrations.

## Production backup record

A full D1 SQL export completed before the production portal migration:

- File: `ce88098b-bff4-4d06-a0df-7bf29622a085-0000007f-00000000-00005124-3d10acf27af286f65269ddf3b096b78f.sql`
- Export bookmark: `0000007f-00000000-00005124-3d10acf27af286f65269ddf3b096b78f`

The export was generated by Cloudflare's D1 export service. Its signed download URL is temporary and is intentionally not stored in Git.


## Latest migration 0009 backup bookmarks

- Production export completed 2026-11-15 before migration 0009: `00000099-00000000-00005124-92593d88a25ddcdb7c0601a037b70004`.
- Staging export completed 2026-11-15 before migration 0009: `0000005f-0000004a-00005124-4ad50938687c5ea3b1975579db530105`.
- Signed export URLs are temporary and are not stored in Git.
