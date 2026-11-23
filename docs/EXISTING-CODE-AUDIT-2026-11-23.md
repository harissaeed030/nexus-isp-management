# NEXUS existing-code audit

**Audit date:** 2026-11-23  
**Target:** `harissaeed030/nexus-isp-management`  
**Branch:** `build/nexus-isp-core`  
**Scope:** Read-only source/configuration review through GitHub; no deployment, database mutation, secret access, or live network-device calls.

## Executive result

**Release decision: NO-GO for production.** The branch contains a substantial local ISP operations application and a separate Cloudflare D1 API candidate, but the runtimes are not interchangeable and the release gates documented by the project remain open. Do not deploy the branch's default Worker config over the hosted production service, and do not use local SQLite as the production system of record.

## Confirmed strengths

- Local Node.js/Express + SQLite runtime with migrations, password hashing, hashed bearer sessions, tenant-scoped data access, role permissions, rate limiting, audit logging and database backup/restore utilities.
- Broad local ISP modules: customers, packages, subscriptions, invoices, payments, tickets, staff, collections, field operations, inventory, router/OLT/ONU records and TR-069 adapter scaffolding.
- Local verification scripts cover smoke workflows, financial invariants, permission boundaries, migration behavior, network adapters, sync contracts and shared database contracts.
- Server-side integration boundaries are documented; Gemini, WhatsApp, router and ACS secrets are intended to remain server-side.
- A separate D1 API candidate and a one-way SQLite-outbox-to-D1 sync Worker are present.

## Findings

### P0 — Deployment target ambiguity (must resolve before any Worker deployment)

`worker/wrangler.toml` deploys `src/index.js` as Worker `nexus-api` and binds legacy database `nexus-db`. That entry point implements only `GET /api/health`, `OPTIONS`, and a 404 for other paths. It is not the full ISP API.

The full D1 API candidate is `worker/src/d1-api-worker.js`, with a separate `worker/wrangler.api.toml` targeting `nexus-saas-api-staging` and `nexus-saas-staging-db`. Production and staging must remain separate. **Never deploy `worker/wrangler.toml` or `worker/src/index.js` as a replacement for the hosted API.** Verify the actual Cloudflare Worker name, entry point, D1 binding and deployed commit in the Cloudflare dashboard before any change.

### P0 — D1 schema parity is not established

The checked-in reconciliation record dated 2026-11-17 reports production and staging D1 schema drift: production recorded migrations 1–10, 12, 13 and 100; staging recorded 1–21 and 100. It also reports missing production tables for several operations, network, TR-069 and inventory modules. A migration number or table count is not proof of schema compatibility. Require a fresh read-only schema/ledger diff, verified backup and staging rehearsal before proposing production migrations.

### P0 — Local SQLite and hosted D1 are separate application contracts

The local Express API uses `tenants/tenant_id`, synchronous SQLite access and opaque bearer sessions. The hosted D1 API uses `organizations/organization_id` and a Worker JWT/token-version model. The shared repository currently covers only customers, packages, subscriptions, invoices and payments; legacy Express handlers still use direct SQLite calls. The sync Worker is one-way and limited to those five entities. This is not full replication or complete hosted API parity.

### P1 — Live network integrations are not accepted

RouterOS API-SSL, OLT/ONU inventory and GenieACS/TR-069 adapters exist, but the repository itself marks live MikroTik acceptance, HSGQ-G04R vendor-specific telemetry/provisioning and real ONU task acceptance as pending. Do not run provisioning or customer-impacting commands on live devices until vendor/firmware compatibility and a controlled lab test are signed off.

### P1 — Operational readiness remains incomplete

The roadmap marks automated collection reminders/customer notification scheduling, independent tenant-isolation/security review, production hosting/secrets/firewall/monitoring, backup-restore rehearsal, Android acceptance and controlled production deployment as pending. Automated billing is opt-in and should remain disabled until its workflow is accepted against representative test data.

### P2 — Audit verification limitation

This audit inspected repository metadata, branch files, configuration and test source. The GitHub file connector does not execute the repository. Therefore no fresh `npm run verify`, Worker test run, Android browser test, D1 query, deployment check or hardware acceptance is claimed here. Run the documented test suite from `backend/` in a trusted Node.js 22.13+ environment and retain the actual command output as release evidence.

## Required completion order

1. Freeze deployment and production schema changes until the actual production Worker/configuration and database bindings are independently confirmed.
2. Run `cd backend && npm ci && npm run verify` on the exact audited commit; fix all failures and repeat until clean.
3. Run Worker tests against local mocks and the dedicated staging D1 only; validate the API contract, tenant isolation, JWT/session behavior, CORS, schema bootstrap and financial idempotency.
4. Produce a canonical production-versus-staging D1 schema diff. Prepare narrowly scoped additive migrations only after reviewing dependencies and a verified backup. Never apply SQLite migrations to D1 or a baseline schema to an existing database.
5. Complete security review: tenant-boundary tests across every module, staff permission matrix, session revocation/expiry, input validation, secret handling, CORS allow-list, webhook signature verification, credential encryption and redacted logs.
6. Complete operational tests: backup restore rehearsal, Android Chrome acceptance, billing/notification workflow, monitoring, rollback plan and deployment rehearsal.
7. Complete controlled lab acceptance for MikroTik RB750Gr3 / RouterOS 7, the exact HSGQ-G04R firmware, and the actual ACS/GenieACS NBI before enabling live network actions.
8. Only after all gates pass, create a reviewed release candidate and deploy the explicitly selected runtime with the correct staging/production config.

## Safety decision

No source runtime, production D1 schema, Cloudflare Worker, secret, Green Fiber Net project or Gemini Worker was changed during this audit. This report is a code/configuration audit, not a production certification. Keep the project marked **NO-GO** until every P0/P1 gate above has test evidence and explicit release approval.
