# NEXUS database architecture reconciliation

**Status:** architecture boundary documented; no cross-database synchronization is implemented.
**Reviewed:** 2026-11-15

## Decision

NEXUS has two intentionally separate runtimes:

1. **Cloudflare production/staging:** Cloudflare Worker + D1. This is the hosted SaaS runtime. Production Worker `nexus-saas-api` binds only to `nexus-saas-db`; staging Worker `nexus-saas-api-staging` binds only to `nexus-saas-staging-db`.
2. **Local Android/offline development:** Node.js backend + SQLite. This is a standalone local development and testing runtime. It uses `backend/.env` / `SQLITE_PATH` and does not connect to D1.

The two databases are **not replicas**, do not share a physical schema, and do not automatically sync. Do not copy a SQLite file to D1, point the Worker at a SQLite file, or run the D1 full schema snapshot against an existing database.

## Runtime and ownership matrix

| Concern | Local runtime | Hosted runtime |
|---|---|---|
| API process | Express / Node.js | Cloudflare Worker |
| Database engine | SQLite (`node:sqlite`) | Cloudflare D1 (SQLite-compatible SQL, managed service) |
| Local database location | `backend/data/nexus.sqlite` by default | Not applicable |
| Production database | Never | `nexus-saas-db` |
| Staging database | Never | `nexus-saas-staging-db` |
| Migration ledger | `schema_migrations.version` | D1 `schema_migrations` |
| Deployment | Termux / local Node process | Wrangler Worker + Pages workflows |
| Intended use | Offline development, local QA, demos | Hosted SaaS and customer portal |

## Schema differences found

The names and shapes differ. These are examples, not an exhaustive field-by-field equivalence claim:

| Logical area | Local SQLite | Cloudflare D1 |
|---|---|---|
| Tenant root | `tenants` | `organizations` |
| Customer | `customers.full_name`, `tenant_id` | `customers.first_name/last_name`, `organization_id` |
| Audit | `audit_logs` | `audit_log` |
| Device inventory | `routers`, OLT/ONU tables from local migrations | `network_devices`, `onu_devices` |
| Financial amounts | Integer PKR fields such as `amount_pkr` | Numeric fields such as `amount`, `total` |
| Sessions | Opaque token hash in local session table | Worker session/JWT/token-version model |
| Customer portal | Local portal/notification migrations | `customer_portal_accounts` and portal endpoints |

The D1 schema snapshot currently lists tables including `organizations`, `customer_portal_accounts`, `ticket_messages`, `network_devices`, `onu_devices`, `pppoe_accounts`, `refunds`, `settings` and `api_keys`. Local SQLite has its own tables and additional ISP-specific modules, including coverage areas, applications, field assignments, stock, cash collections and ledger records. Similar feature names do not imply compatible columns or transaction semantics.

## Migration ledgers are independent

### Local SQLite

The local bootstrap in `backend/src/config/database.js` creates its own base tables and applies its local migration files. It records local migration identifiers in `schema_migrations.version`. The local migration history includes hardening, customer/subscription, MikroTik, OLT/ONU, TR-069, portal notifications, ISP business modules, financial lifecycle and session hardening.

There are two local files with a `003_...` filename prefix. The runtime uses descriptive migration identifiers (for example `003_mikrotik_integration`) and explicitly maps the portal-notification step to its own file. Do not infer ordering solely from filenames; preserve the bootstrap's explicit migration identifiers and run the local migration reconciliation tests.

### Cloudflare D1

Production and staging were recorded at D1 migration 0007 in the 2026-11-15 release evidence. The repository only contains D1 migration SQL for 0006 and 0007; historical migrations 0001-0005 are already applied but their SQL artifacts are not in this repository. Do not fabricate those historical files or rerun them.

- `worker/schema.sql` is a full schema snapshot for a **new empty D1 database only**.
- Existing D1 databases must receive reviewed incremental migrations only.
- Production and staging must remain bound to their own D1 databases.

## D1 user email index follow-up (2026-11-15)

A live read-only comparison found that production and staging had drifted in `users` email constraints: production had a global unique email constraint, while staging had a case-insensitive per-organization unique index; production was missing that organization-scoped index. A staging preflight found no duplicate exact emails or case-insensitive collisions. The additive migration `0008_user_email_index_parity.sql` adds explicit global and per-organization unique indexes to both databases without rebuilding the users table. It must be applied to staging first, then production after a fresh D1 export and successful staging checks. Until both migration ledgers record version 8 and live schema verification passes, production release remains NO-GO.

## What “reconciled” means now

- Each runtime has an explicit database owner and deployment path.
- Their schema differences are documented rather than hidden behind a false “same schema” claim.
- Their migration ledgers remain independent and are tested as separate histories.
- No automatic bidirectional sync is enabled.
- The local SQLite database is not promoted to production and the D1 database is not downloaded into Termux automatically.
- A future shared API contract can keep UI behavior consistent, but persistence mapping must be explicit.

## Safe path to a future data migration or offline sync

This is **not implemented** by this documentation change. Before any data movement or synchronization is enabled, implement and review all of the following:

1. A versioned canonical domain/API contract for organizations, users, customers, packages, subscriptions, invoices, payments, tickets and network inventory.
2. Explicit field mapping, including `tenants.id ↔ organizations.id`, name splitting/joining, currency/amount precision, statuses, timestamps and password/session handling.
3. Stable globally unique IDs and tenant ownership validation for every relationship.
4. An append-only outbox/change log with idempotency keys, retry policy, tombstones and conflict handling; never “last write wins” for invoices or payments.
5. A one-way dry-run importer/exporter with row counts, rejected-row report, checksums and a rollback plan; do not move password hashes or session tokens without a dedicated security review.
6. Automated cross-runtime contract tests and a staging-only rehearsal using synthetic tenants before any production data is touched.

Until those controls exist, use each runtime only for its declared purpose and enter production customer data only through the hosted production application.

## Operational checklist

- Local: `cd backend && npm run verify`; keep `backend/data/` private and back it up with `npm run db:backup`.
- Staging: deploy only with `worker/wrangler.toml`; verify it binds to `nexus-saas-staging-db`.
- Production: deploy only with `worker/wrangler.production.toml`; verify backup, migration state, inherited secrets/bindings and staging E2E first.
- Never run `worker/schema.sql` on an existing D1 database.
- Never claim SQLite/D1 data parity or synchronization unless a separately reviewed sync implementation and reconciliation report exist.
