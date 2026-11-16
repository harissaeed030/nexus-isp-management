# NEXUS database architecture reconciliation

**Status:** D1 production authority selected; SQLite remains an offline/local workspace. A shared asynchronous SQLite/D1 adapter and tenant-scoped repository now exist for the five core synchronized entities. Legacy Express route handlers still use direct synchronous SQLite calls; full route migration and full-schema parity remain pending. Synchronization remains a separate, guarded one-way workflow.
**Reviewed:** 2026-11-15

## Decision

NEXUS currently has two separate runtimes. They are not interchangeable and must not be merged by copying database files or applying one runtime's migrations to the other.

1. **Local/offline development:** Node.js + Express + SQLite in `backend/`. This is the maintained Android/Termux development runtime. Its default database is `backend/data/nexus.sqlite`.
2. **Hosted production/staging:** Cloudflare Worker + D1, maintained and released from the repository's `main` branch. The production release record is [2026-11-15 production release](https://github.com/harissaeed030/nexus-isp-management/blob/main/docs/PRODUCTION-RELEASE-2026-11-15.md).

The `worker/` directory on this development branch is only a health-check Worker. It is not the production API and must never be deployed over the production Worker.

## Selected data authority (2026-11-15)

**Cloudflare D1 is the authoritative production source of truth.** The production Worker and its D1 database own hosted ISP customer, subscription, invoice and payment records. Local SQLite is an offline/local workspace only; it is not a competing production master.

When offline sync is implemented, the only permitted direction for business writes is SQLite outbox → authenticated production Worker → D1. D1 changes must not be overwritten by stale local snapshots. The local client must retain pending operations until the server acknowledges them, and must surface conflicts for manual resolution. Financial records (invoices, payments, reversals, refunds and credit notes) are append-only or state-transition operations with idempotency keys; they must never use blind last-write-wins.

This is an architectural decision, **not a claim that synchronization exists today**. See [SQLite-to-D1 synchronization implementation plan](SQLITE-TO-D1-SYNC-PLAN.md).

## Runtime ownership

| Area | Local development branch | Hosted production |
|---|---|---|
| API | Node.js / Express | Cloudflare Worker |
| Database | SQLite via `node:sqlite` | Cloudflare D1 |
| Tenant root | `tenants` | `organizations` |
| Tenant key | `tenant_id` | `organization_id` |
| Audit table | `audit_logs` | `audit_log` |
| Customer name | `full_name` | `first_name` + `last_name` |
| Money | Integer PKR fields such as `amount_pkr` | Numeric fields such as `amount` and `total` |
| Authentication | Opaque bearer token stored as a hash in SQLite sessions | Worker JWT / token-version model |
| Migration ledger | Local SQLite `schema_migrations` | Independent D1 `schema_migrations` |

The table describes conceptual equivalents only. It is not a safe SQL conversion specification. Other differences include statuses, foreign keys, timestamps, IDs, customer portal records, network inventory and transaction behavior.

## Migration boundaries

### Local SQLite

- Bootstrap and migration runner: `backend/src/config/database.js`.
- Migration files: `backend/migrations/`.
- Local migration history includes versions 001 through 010; version 006 intentionally maps to the legacy-named `003_customer_portal_notifications.sql`.
- Version 010 adds payment promises. The migration runner and reconciliation tests must remain restart-safe and preserve existing customer, invoice and payment rows.
- Use `cd backend && npm run verify` to run the local verification suite.

### Cloudflare D1

- Production Worker: `nexus-saas-api`, source `worker/src/production-worker.js` on `main`.
- Production D1: `nexus-saas-db`.
- Staging Worker/D1 are separate resources.
- The 2026-11-15 production release records D1 schema version 0009.
- D1 migrations are maintained under `cloudflare/d1/migrations/` on `main`. Historical migrations 0001-0005 are already applied but their SQL files are not present in the current repository history.
- `worker/schema.sql` on `main` is a complete snapshot for a new, empty D1 database only. Existing D1 databases must use reviewed incremental D1 migrations.

Never run `backend/migrations/*.sql` against D1. Never run D1 migrations against the local SQLite database. Never run a full schema snapshot over an existing database.

## Deployment safeguards

- This branch's `worker/wrangler.toml` points to the legacy development resource `nexus-db` and its `worker/src/index.js` exposes only `GET /api/health` and `OPTIONS`.
- Do not deploy this branch's Worker configuration or source to production.
- Production deployment must use the production config and source recorded on `main`, after backup verification, staging E2E, migration-state verification and secret/binding review.
- Keep production secrets out of Git, source files, browser code and chat messages.

## Data movement and synchronization

A shared persistence contract now exists under `shared/database/` (see [Shared database architecture](SHARED-DATABASE-ARCHITECTURE.md)). The existing sync implementation remains a separate one-way SQLite outbox → authenticated Worker → D1 workflow for customers, packages, subscriptions, invoices and payments only. This is not full database replication or bidirectional synchronization. A local SQLite database is not production data. Do not manually copy rows or database files between environments.

Before implementing a future migration or offline sync, require:

1. A versioned canonical API/domain contract.
2. Explicit, tested mappings for tenant ownership, names, statuses, money precision, timestamps, relationships and IDs.
3. Tenant-consistency validation for every imported relationship.
4. An idempotent outbox/import process with retries, tombstones and conflict handling. Invoices and payments must never use blind last-write-wins.
5. A dry-run report with source/target counts, checksums, rejected rows and rollback instructions.
6. No password-hash or session-token transfer without a separate security review.
7. A staging-only rehearsal using synthetic data and cross-runtime contract tests.

Until those steps are implemented and accepted, keep local development data and hosted customer data separate. Enter real production customer data only through the hosted production application.

## Acceptance criteria

- Local SQLite tests pass independently of D1.
- D1 migrations are validated independently of SQLite.
- The development Worker cannot be mistaken for the production Worker.
- The production and staging D1 bindings remain separate.
- No claim of data parity or synchronization is made without a tested implementation and reconciliation report.


## Shared repository rollout status (2026-11-16)

- `shared/database/adapters.js` provides SQLite and D1 adapters with one asynchronous method contract.
- `shared/database/repository.js` provides tenant-scoped CRUD, pagination, optimistic update checks and safe archival.
- `shared/database/schema.js` describes physical mappings for customers, packages, subscriptions, invoices and payments.
- The local SQLite runtime exports this repository as `repository`; existing synchronous routes are intentionally preserved until individually migrated.
- CI now runs shared contract tests. This does not establish production D1 migration readiness or full module parity.
- Users, sessions, staff permissions, tickets, refunds, notifications, PPPoE credentials, routers, OLT/ONU and ACS still need reviewed mappings before they can share this persistence contract.
