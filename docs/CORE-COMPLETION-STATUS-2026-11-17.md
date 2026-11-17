# NEXUS core completion status — 2026-11-17

## Scope and safety

Repository: `harissaeed030/nexus-isp-management`  
Target branch: `build/nexus-isp-core`  
Purpose: record the current implementation evidence and release blockers without changing production infrastructure.

This inspection was read-only against Cloudflare. No D1 rows or schema were changed, no Worker was deployed, no secrets were read or modified, and no live network device was contacted.

## Verified repository implementation

The development branch contains a Node.js 22.13+ / SQLite API (version 0.2.0), a mobile-oriented dashboard, database migrations, and a separate Cloudflare D1 API Worker. Source and package scripts show implementation for:

- Owner authentication, bearer sessions, tenant-scoped API queries and role/module permissions.
- Customer CRUD and profile/history; packages and subscription lifecycle.
- Invoices, payments, financial reports and monthly billing scheduler (disabled by default).
- Support tickets, customer portal, notifications and audit logs.
- Staff management, CSV exports and ISP operations/inventory modules.
- MikroTik RouterOS API-SSL adapter, encrypted credential storage, PPPoE provisioning routes and mock adapter.
- OLT/ONU inventory and capability routes; GenieACS/TR-069 adapter routes.
- SQLite migrations, backup/restore utilities, and a limited SQLite-to-D1 outbox/sync implementation.
- Shared SQLite/D1 repository metadata for customers, packages, subscriptions, invoices and payments.

These are source-level findings, not certification that every route and UI workflow works end-to-end.

## Repository integration status

A GitHub compare of `main` and `build/nexus-isp-core` reports the histories have diverged: the development branch is 361 commits ahead and 86 commits behind main. Do not merge, rebase, force-push, or replace either branch without a reviewed integration plan. Branch-only implementation and main's production release history must be reconciled by file/commit and CI evidence.

## Cloudflare read-only findings

- Account contains separate production and staging API Workers and D1 databases.
- `nexus-saas-api-staging` is bound to `nexus-saas-staging-db`; its Worker settings show the expected D1 binding and secret *names* (JWT_SECRET, ALLOWED_ORIGINS, TURNSTILE_SECRET_KEY). Secret values were not accessed.
- Production API Worker and production D1 are separate resources. No production deployment or configuration was changed.
- Live D1 application-table comparison (excluding Cloudflare's internal `_cf_KV`) returned 30 tables in staging and 31 in production. The only table-name difference is `sync_state`, present in production only.
- Staging schema migration ledger records IDs 1–9, 11 and 100; production records IDs 1–10 and 100. This is a ledger divergence that needs reconciliation against the actual schema and deployed Worker code; do not infer a safe migration from the numbers alone.
- The live `users` table definitions differ: staging permits a nullable password hash and has different defaults/column shape; production requires a password hash and uses a different role/ID default shape.
- Read-only `PRAGMA foreign_key_check` returned zero violations in both staging and production databases.

The `sync_state` table difference may be legacy; the current checked-in SQLite-to-D1 sync Worker uses `sync_operations` and `sync_tenant_mappings`, not `sync_state`. Verify the deployed Worker version before removing or adding any schema object.

## Completion checklist and priorities

### P0 — required before a release candidate

- [ ] Reconcile `build/nexus-isp-core` with current `main` without discarding either history; resolve overlapping changes and choose one exact candidate SHA.
- [ ] Run `npm run verify` from the branch's `backend/` directory on the exact candidate commit; retain the complete CI result.
- [ ] Complete a disposable D1 export/restore rehearsal; compare schema objects, row counts and IDs, run integrity and foreign-key checks, and retain evidence.
- [ ] Resolve staging/production D1 migration-ledger and `users` DDL differences through a reviewed additive migration or documented intentional divergence. Never run a staging table rebuild on production.
- [ ] Run staging E2E for owner/staff auth, tenant isolation, customer CRUD, package/subscription lifecycle, invoices, payments/refunds, tickets, permissions, exports and customer portal.
- [ ] Complete Android Chrome owner/staff/customer-portal acceptance checks.
- [ ] Obtain an independent security review and resolve findings.
- [ ] Benchmark the deployed Worker password-hashing implementation in the actual Cloudflare runtime and verify its CPU budget; Node benchmarks are not a substitute.

### P1 — complete platform integration

- [x] Add a backward-compatible D1 Worker method adapter for dashboard `PATCH` updates by mapping them to the existing `PUT` handlers; add a contract test. This is committed on the development branch only and has not been deployed.
- [ ] Complete the dashboard/D1 compatibility layer. Dashboard and ticket/report adapters are now in place; customer CRUD DTO mapping and an additive D1 migration are committed, but the migration has not been applied and customer E2E acceptance is still open. Package, subscription, invoice and payment DTOs plus remaining network/operations route families still need deliberate mapping. Do not assume path-prefix rewriting alone makes the APIs interchangeable.
- [ ] Migrate remaining legacy SQLite route handlers to the shared async repository where appropriate; preserve SQLite compatibility and transaction semantics.
- [ ] Expand database mapping/sync deliberately beyond the current five entities. Users, sessions, staff permissions, tickets, refunds, notifications, PPPoE credentials, routers, OLT/ONU and ACS data are not part of the current shared sync contract. Never sync passwords, session tokens or device secrets.
- [ ] Define and test conflict, deletion, retry, reconciliation and recovery behavior before enabling broader synchronization. Financial ledger records must remain immutable.
- [ ] Verify the admin dashboard against the D1 API contract rather than assuming the local SQLite API contract is interchangeable.
- [ ] Complete deployment provenance checks: exact Worker version/source, bindings, origins and configuration against the reviewed release commit.

### P2 — external network integrations

- [ ] Test MikroTik RouterOS API-SSL against an authorized non-production router: identity, resources, PPPoE sessions/profiles, secret create/update, suspend/restore and sync.
- [ ] Verify HSGQ-G04R OLT and Huawei ONU management using documented vendor-supported interfaces. Current inventory/capability records are not proof of optical telemetry or provisioning.
- [ ] Verify GenieACS/TR-069 against a reachable ACS and test ONU: inform, identity, parameter reads and explicitly approved configuration writes.
- [ ] Confirm real payment-provider and scheduled-billing behavior in a non-production environment before enabling automatic billing.


The PATCH/PUT method mismatch has now been addressed in the development branch (Worker compatibility adapter plus contract test). The remaining mismatch is not resolved: customer/package/subscription/invoice/payment request and response field shapes still differ, several dashboard route families remain unimplemented in the D1 Worker, and the admin UI has not passed D1 end-to-end acceptance. The compatibility work must continue with explicit, tested DTO mapping rather than blanket path rewriting.


The D1 API compatibility layer now also exposes dashboard summary routes in the response shape expected by the existing UI, aliases the dashboard's `/api/tickets` path to the tenant-scoped complaints module, and maps ticket list/create fields. Role permission mapping was updated for the dashboard/report aliases. GitHub Actions passed the D1 Worker syntax check and contract tests on commit `ff66e87e0b15550987ebda56c0a240fe6a2123af`. This does not establish full dashboard compatibility: customer/package/subscription/invoice/payment DTO mappings, other UI route families, and end-to-end D1 acceptance remain open.


Verification on `ff66e87e0b15550987ebda56c0a240fe6a2123af`: GitHub Actions `Cloudflare D1 API Worker`, `Nexus backend checks`, and `Nexus backend verification` all completed successfully. The D1 Worker workflow ran `node --check worker/src/d1-api-worker.js` and `node --test worker/scripts/d1-api-contract.test.js`; the backend workflows ran their configured checks. The documentation-only follow-up commit is `a3d99d3d010def53fe684d19a5a6f10a3833ff4c`. These are automated source checks, not a live staging API acceptance test.

## Explicit integration boundaries

- Local SQLite and Cloudflare D1 are separate runtime databases; they are not replicas.
- Current sync covers customers, packages, subscriptions, invoices and payments in one direction (SQLite to D1). It is not full or bidirectional synchronization.
- Router, OLT/ONU and ACS adapters must remain labelled unverified until successful real-device checks are recorded.
- Automatic monthly billing remains opt-in and disabled by default.
- Backup/restore code exists, but a successful operational restore rehearsal is still required.

## Release decision

**Not certified production-ready.** The source tree contains broad core functionality, but integrated release evidence, D1 schema reconciliation, complete D1 dashboard/API acceptance, backup/restore rehearsal, independent security review, and live hardware verification remain outstanding.

**Testing readiness:** suitable to begin controlled local/staging testing after selecting an exact candidate SHA and confirming staging data is synthetic and backed up.  
**Production readiness:** NO-GO until all P0 release gates are evidenced and approved.


## Customer dashboard compatibility work — 2026-11-17

The development branch now contains a first customer-management compatibility slice:

- D1 customer list accepts the dashboard's `pageSize`, `q`, `coverageArea` and `connectionStatus` filters and returns `pagination.pageSize`.
- Customer rows expose `full_name`, `account_number`, `service_address`, `coverage_area` and a distinct `connection_status`.
- Create/update adapters translate dashboard camelCase fields, split full names, and keep account status separate from connection status.
- The customer profile route returns tenant-scoped subscriptions, invoices, payments, complaints and history collections.
- Delete now returns HTTP 409 when linked billing, subscription, support or network records exist, matching the dashboard's stated retention behavior.
- New additive D1 migration: `cloudflare/d1/migrations/0012_customer_workspace_compatibility.sql`. It adds customer workspace columns and tenant-guarded history tables. It has been committed only; it has NOT been applied to staging or production. The updated Worker requires this migration before customer routes that query the new columns can be exercised.
- Contract tests cover the DTOs, route expectations, linked-record protection and migration tenant guards. GitHub Actions D1 Worker and backend verification workflows passed on `55703f4a7d2b02e475114941e5fa3b2d9bbcfb6f`; the backend checks workflow was still running at the time of this note.

No Cloudflare D1 schema was changed and no Worker was deployed. Production and staging remain untouched. Customer compatibility is not yet end-to-end verified; package, subscription, billing, network and operations adapters remain open.


## Package and subscription compatibility work — 2026-11-17

A second dashboard compatibility slice is committed:

- Package list/create/update/get now map dashboard `speedDownMbps`, `speedUpMbps`, `monthlyPricePkr` and Active/Archived fields to the existing D1 package columns and back.
- Subscription list/create/update/get map dashboard camelCase customer/package/date fields, expose customer and package display fields, and return dashboard pagination.
- Subscription renewal endpoint `POST /api/subscriptions/:id/renew` is implemented with a bounded 1–365 day interval, expiry extension and an audit/history entry.
- Subscription lifecycle status is represented by an additive `workspace_status` column so the dashboard's `pending` state does not violate the legacy D1 status CHECK constraint. A pending subscription is stored as legacy `suspended` as a fail-closed compatibility value.
- New additive D1 migration: `cloudflare/d1/migrations/0013_subscription_workspace_status.sql`. Apply only after migration 0012. Neither migration has been applied to staging or production.
- Contract tests cover customer, package and subscription DTOs and the renewal route. The D1 Worker workflow passed on `240e3815076f9da9b1fe1ab3c110d86b7de8cfbd`; backend checks and verification were still running when this note was prepared.

The code is committed to the development branch only. No Worker deployment, D1 migration execution, production data change, secret operation or live router action was performed. End-to-end staging acceptance remains outstanding.
