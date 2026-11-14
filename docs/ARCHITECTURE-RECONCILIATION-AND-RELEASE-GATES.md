# NEXUS Architecture Reconciliation, Migration and Release Verification

**Audit date:** 2026-11-14  
**Audited release line:** `release/v1.0.0-rc1`  
**Decision:** **NOT READY — keep production data and deployment unchanged.**

## Executive decision

NEXUS currently has two incompatible application tracks:

1. **Node.js + SQLite** in `backend/`, intended for local/offline development.
2. **Cloudflare Pages + Workers + D1** in the connected Cloudflare account, currently hosting the public frontend and API.

They do not share a proven API contract or database schema. Treat SQLite as a local development/test runtime and Cloudflare Workers + D1 as the hosted integration target only after an explicit schema/API convergence release. Do not point both runtimes at the same data or copy migrations between them.

## Verified Cloudflare inventory (read-only audit)

- Pages project: `nexus-isp-management`.
- Pages production branch: `dev`.
- Latest production Pages deployment observed: commit `e2c8db5590010712287aa1eac88f06df934caec3`.
- Latest RC Pages preview observed: commit `bc45879a2ba799ec14c580bc9dd074bf5a1daadc`; preview deployment succeeded. This is not the production deployment.
- Production Worker: `nexus-saas-api`, D1 binding `DB` -> `nexus-saas-db`.
- Staging Worker: `nexus-saas-api-staging`, D1 binding `DB` -> `nexus-saas-staging-db`.
- Both D1 databases have 23 tables. Cloudflare's database-list metadata reported `num_tables: 0`, but a read-only `sqlite_master` query confirmed 23 tables in each database.
- Production D1 currently contains 1 organization, 1 user and 5 rows in `schema_migrations`. This is live account data: do not reset, seed, migrate, import over, or run destructive tests against it.
- Staging D1 contains 0 organizations, 0 users and 0 migration-ledger rows. It is the only candidate for controlled disposable verification, subject to a separate snapshot/rollback plan.
- Worker settings show secret bindings named `JWT_SECRET` and `ALLOWED_ORIGINS`; secret values were not read or recorded.

## Confirmed integration gaps

- The deployed Worker source contains the legacy `/api/...` contract; it does not contain `/api/v1` routes or customer-portal route markers.
- GitHub PR #21 describes a separate customer portal implementation and says it was not deployed. Its local/in-memory checks do not prove end-to-end behavior against the deployed Worker and D1.
- The Pages project production branch remains `dev`; the RC branch deployment is preview-only. Do not infer that the production site is running the RC backend.
- The deployed Worker and its bound D1 are not the same target declared in the checked-in `worker/wrangler.toml` (`nexus-api` / `nexus-db`). Deployment configuration must be reconciled before any automated deployment workflow is enabled.

## SQLite and D1 schema reconciliation

The SQLite release candidate uses `tenant_id` and tables such as `tenants`, `audit_logs`, `routers`, and `billing_runs`. The deployed D1 schema uses `organization_id` and a different set of tables, including `organizations`, `audit_log`, `network_devices`, `onu_devices`, `pppoe_accounts`, and `refunds`.

These are not interchangeable schemas. Required work before convergence:

- Approve one canonical domain model and document the tenant/organization naming map.
- Define a versioned, idempotent D1 migration chain separately from SQLite migrations.
- Define explicit API route, request/response, authentication principal and error-shape contracts.
- Add contract tests that run against both adapters or formally designate one runtime as the only supported runtime for each release.
- Build a reviewed, reversible data migration plan before transferring any live records.

## SQLite migration collision finding

The release candidate's SQLite bootstrap creates a migration ledger and applies files in lexical order. Its current loop snapshots already-applied versions before iterating and does not add a version to that in-memory set after applying a file. If two migration files share the same numeric version, both are attempted on a fresh database; the second ledger insert collides with the version primary key and the transaction fails.

Earlier repository inspection identified duplicate prefixes in the migration set:
- `002_customer_subscription_management.sql` / `002_financial_management.sql`
- `003_customer_portal_notifications.sql` / `003_mikrotik_integration.sql`
- `005_tr069_genieacs.sql` / `005_isp_business_modules.sql`

Required fix: assign every migration a unique immutable version (prefer timestamp or monotonically increasing integer), verify checksums/ordering, and test fresh install plus upgrades from every supported prior schema on disposable copies. Do not rename or rewrite already-applied production migrations without a reviewed compatibility strategy.

## Customer portal end-to-end test plan

PR #21 is not evidence of a live portal. Before release, run the following against a dedicated staging tenant and staging D1:

- Customer account provisioning, invite/reset, disable and re-enable.
- Login with valid, invalid, disabled and cross-tenant identities.
- Customer profile and active subscription read.
- Invoice, outstanding balance, payment and refund history.
- Complaint create/list/status progression and tenant/customer isolation.
- Password change, token expiry/revocation and logout.
- Admin-to-customer account lifecycle.
- Browser network/API contract checks, mobile Android Chrome viewport and accessibility basics.
- Confirm no customer can enumerate or read another customer's records by changing IDs, tenant slugs or request parameters.

Use synthetic test records only. Capture request IDs and sanitized results, never passwords, bearer tokens or personal customer data.

## Security review findings and scope

This is an internal static configuration/code review, **not an independent third-party penetration test or certification**.

Items requiring independent verification:
- Production Worker observability currently has query-string redaction disabled; staging has it enabled. Enable/verify redaction before accepting sensitive query parameters.
- The Worker audit helper catches and suppresses audit-write errors; decide which security/financial actions must fail closed or alert when audit persistence fails.
- Verify password-hash parameters, login enumeration/rate-limit behavior, JWT expiry/revocation, browser token storage, XSS/CSRF, CORS origin rules and secure headers.
- Verify every route derives tenant scope from the authenticated principal and rejects cross-tenant object IDs.
- Verify relational constraints prevent cross-organization references among customers, subscriptions, invoices, payments, refunds and tickets.
- Review production secrets and rotation procedure without printing or exporting secret values.
- Obtain a separate reviewer who did not implement the code and retain a written findings/remediation report.

No secrets were read, changed or exposed during this audit.

## Backup and restore status

- SQLite `backend/scripts/backup.js` uses `VACUUM INTO`, restrictive file permissions and `PRAGMA quick_check`. This checks snapshot integrity, but does not by itself prove a successful restore, application consistency, encryption, off-device retention or recovery objectives.
- No SQLite restore drill was run because the live Termux database file is not available in this GitHub/Cloudflare audit session.
- D1 production contains live organization/user data; no export/import/restore was run against it.
- D1 staging is empty and can be used for a separately approved export/import drill. Verify schema, indexes, migration ledger and application health after restore; record RPO/RTO and retain an off-account encrypted copy.
- Never use D1 time-travel restore or import as a test against the production database.

## Safe execution sequence

- [ ] Freeze production Worker, Pages production branch and production D1 schema/data while reconciling.
- [ ] Make the SQLite migration versions unique and add fresh-install/upgrade tests on temporary databases.
- [ ] Choose and publish the canonical hosted API contract and matching Worker/D1 migration set.
- [ ] Reconcile Pages frontend API base/path and Worker route contract.
- [ ] Port or explicitly defer PR #21 portal routes; then run staging end-to-end tests.
- [ ] Run cross-tenant, authentication, authorization and browser security tests on the exact integrated commit.
- [ ] Complete independent security review and remediate all Critical/High findings.
- [ ] Complete staging backup/export/import/restore and application-level recovery drills.
- [ ] Only then request human release approval and a separately reviewed production deployment.

## Audit outcome

**Architecture reconciliation:** findings documented; convergence not implemented.  
**Migration conflicts:** root cause documented; migration renumbering not yet applied.  
**Customer portal E2E:** not run against deployed staging API; PR #21 remains unmerged/unproven.  
**Independent security review:** not completed; internal static findings listed.  
**Backup/restore:** backup implementation inspected; full restore drill not completed.  
**Production:** unchanged by this audit. No production migration, data write, Worker upload, Pages rollback or deployment was performed.
