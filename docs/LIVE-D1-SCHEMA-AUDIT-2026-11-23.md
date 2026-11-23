# Live Cloudflare D1 schema audit

**Audit date:** 2026-11-23  
**Scope:** Read-only inspection of the connected NEXUS production and staging D1 databases using `sqlite_master` and `schema_migrations`.  
**Mutation status:** No SQL writes, migrations, exports, restores, Worker deployments, or secret changes were performed.

## Live object inventory

Counts below come from direct SQL against `sqlite_master`, not Cloudflare's database-list `num_tables` metadata (which returned zero for both databases).

| Object | Production (`nexus-saas-db`) | Staging (`nexus-saas-staging-db`) |
|---|---:|---:|
| Tables, including `_cf_KV` | 51 | 50 |
| Indexes | 73 | 86 |
| Triggers | 28 | 32 |
| Total objects | 152 | 168 |

The production database has one table not present in staging: `sync_state`. The remaining application table names are present in both environments. This is not proof of column, constraint, index, trigger, or data parity.

## Migration ledgers

Production records IDs: **1–13, 100, 101**.  
Staging records IDs: **1–21, 100**.

Notable differences:
- Production migration 11 is `0011_sqlite_sync_inbox`; staging migration 11 is `0011_sync_staging_with_production`.
- Production records migration 101, `2026-11-17-staging-schema-additive-reconcile`; staging does not.
- Staging records migrations 14–21, which production does not record.
- Production's migration timestamps for IDs 12 and 13 are later/earlier than their numeric ordering in a way that makes the ledger ID alone insufficient to infer chronological order.

Never apply migrations merely because an ID is missing. Reconcile the exact SQL, live schema and data dependencies first.

## Confirmed object differences

### Production-only objects

- Table: `sync_state`.
- Indexes: `idx_login_attempts_email`, `idx_login_attempts_ip`, `idx_users_email_global`.

### Staging-only objects

Indexes:
- `idx_acs_connections_org`
- `idx_network_connectors_org_status`
- `idx_network_devices_org_type`
- `idx_network_jobs_connector_queue`
- `idx_network_jobs_org_created`
- `idx_ops_applications_org`
- `idx_ops_assignments_org`
- `idx_ops_collections_org`
- `idx_ops_inventory_org`
- `idx_ops_ledger_customer`
- `idx_ops_promises_org`
- `idx_router_customer_mappings_org_customer`
- `idx_router_customer_mappings_org_online`
- `idx_tr069_audit_org_created`
- `idx_tr069_devices_connection`
- `idx_tr069_devices_org_inform`

Triggers:
- `trg_network_connectors_tenant_guard`
- `trg_network_jobs_tenant_guard`
- `trg_users_password_hash_insert`
- `trg_users_password_hash_update`

### Material schema/constraint drift requiring review

- The production `users.password_hash` column is `NOT NULL`; the staging definition permits NULL. The role defaults also differ (`staff` in production versus `member` in staging).
- Staging has password-hash guard triggers that production does not currently list. The column constraint and triggers must be reconciled together with the deployed authentication code.
- Production has `idx_users_email_global`, which is absent from staging. Staging has the organization-scoped case-insensitive email index; both indexes and the intended email uniqueness model must be reviewed together.
- The `sync_records` indexes are materially different: production has a unique index on (tenant_id, table_name, record_id), while staging's similarly named index is non-unique and its column set differs. Production also has tenant/table-scoped indexes that staging does not.
- Production includes `sync_state`; staging does not.
- Several other table/index/trigger SQL definitions differ in their stored SQL text. Whitespace-only differences should be normalized before treating them as semantic drift; column lists, defaults, constraints, foreign keys and trigger bodies must be compared separately.

## Deployment and migration decision

**Do not deploy a schema migration or Worker release based solely on this audit.** The two databases have the same broad application table coverage but are not schema-parity aligned. In particular, the `users` and sync index differences are security/integrity-sensitive.

Required safe sequence:
1. Export and validate a private backup of the intended target database.
2. Generate a normalized per-table diff of columns, defaults, constraints, foreign keys, indexes and trigger bodies.
3. Reconcile production and staging against the exact deployed Worker source and checked-in migration files; do not assume staging is the desired canonical schema.
4. Prepare narrowly scoped additive migrations with explicit preflight checks. Do not rebuild or replace populated tables to force parity.
5. Rehearse the exact migration set on a disposable restored copy, including tenant-isolation and authentication tests.
6. Only then schedule a reviewed environment-specific deployment with rollback/recovery steps.

## Worker isolation

The Cloudflare account has distinct production and staging API Workers and separate sync Workers. Preserve those boundaries. The development branch's legacy `worker/wrangler.toml` points to a health-check Worker and legacy database; the full D1 API candidate uses `worker/wrangler.api.toml` and the staging database. Never deploy the legacy health-check entry point over the hosted API.

## Conclusion

The live databases are **not fully aligned**. Their table coverage is now much closer than the earlier 2026-11-17 audit suggested, but the current differences include authentication constraints, sync uniqueness, missing tenant guard triggers, and an extra production table. Production was left unchanged.
