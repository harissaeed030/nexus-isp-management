# NEXUS Repository Audit

**Audit date:** 2026-11-11  
**Product:** NEXUS ISP Management  
**First tenant:** Vancom Networks (Pvt) Ltd  
**Repository:** https://github.com/harissaeed030/nexus-isp-management  
**Audit scope:** GitHub repository metadata, tracked file tree, README, backend starter, SQLite core branch, Cloudflare Worker scaffold, documentation and open PR metadata/patch.  
**Execution limitation:** This audit was performed by reading GitHub-hosted source. No shell was available in this audit session, so no local install, runtime or test command is claimed as executed.

## 1. Repository and branch findings

- Default branch: `main`.
- The repository has working branches `build/nexus-isp-core`, `design/professional-saas-dashboard`, and `saas/cloudflare-foundation`.
- A `dev` branch was created and fast-forwarded to the current `build/nexus-isp-core` head. It is intentionally not based on the older `main` snapshot.
- At comparison time, `build/nexus-isp-core` was 34 commits ahead of `main` and had no commits behind it. The build branch contains the newer SQLite application implementation.
- Open PR #1: “Redesign Nexus dashboard with a professional SaaS UI”. Head: `design/professional-saas-dashboard`; base: `build/nexus-isp-core`; 8 commits, 3 changed files; not merged. GitHub reported mergeability as false/unknown during inspection. It was not merged or changed during this audit.
- `main` and `build/nexus-isp-core` represent materially different stages of the project. Do not develop new features from `main` unless the branches are deliberately reconciled.

## 2. What exists

### Current development base: `build/nexus-isp-core`

- Node.js API using Express 5 and JavaScript ES modules.
- Local SQLite using Node's built-in `node:sqlite` API; the database file is created locally under `backend/data/`.
- Initial tenant/owner setup, login, logout, bearer-token sessions and password hashing using Node crypto scrypt.
- Tenant-scoped customer, package, subscription, invoice, payment, ticket, dashboard and audit-log routes.
- Staff account and per-user permission support in `backend/src/routes/operations.routes.js` and `backend/src/lib/permissions.js`.
- Router inventory records are present, but are not a live RouterOS integration.
- The static HTML/CSS/JavaScript dashboard is served by the Express API.
- A smoke-test script, password-reset helper and backend-checks GitHub Actions workflow exist.
- Backend package scripts include `check`, `test` and `verify`.

### Older `main` snapshot

- Static dashboard prototype with sample figures.
- A separate MongoDB/Mongoose Express starter.
- A Cloudflare Worker/D1 scaffold and SQL schema.
- The main README still describes sample dashboard data and an earlier MongoDB direction.

### Cloudflare Worker scaffold

- `worker/src/index.js` currently implements only GET health and OPTIONS handling; non-GET requests are rejected.
- `worker/schema.sql` defines initial tenant, user, customer, package, subscription, invoice, payment, ticket and audit tables.
- Worker README explicitly says authentication, sessions, tenant authorization, CRUD validation and audit events are not complete.
- This Worker is a second backend direction beside the newer local SQLite backend. It must not be deployed or treated as production-ready.

## 3. Known gaps and risks

1. **Authentication/session hardening:** the current local API returns bearer tokens to the browser and stores them in sessionStorage. There is no demonstrated refresh-token rotation or httpOnly-cookie session flow. Review token expiry, revocation, brute-force protection and CSRF implications before production.
2. **Input validation:** routes contain hand-written checks, but a consistent schema-validation layer for every endpoint is not evident.
3. **Database migrations:** the SQLite database module creates tables with `CREATE TABLE IF NOT EXISTS`; a versioned migration/rollback framework is not evident.
4. **Customer deletion:** the customer DELETE route performs a hard delete when foreign-key constraints permit; the requested soft-delete lifecycle is not implemented.
5. **Billing:** invoices and payments can be recorded, but a verified recurring monthly billing scheduler, sequential per-tenant invoice counter, append-only financial ledger, reversals, PDF invoices/receipts and collection closing are not established.
6. **Search and pagination:** server-side pagination and comprehensive filters are not established in the inspected customer route.
7. **Customer/PPPoE data:** PPPoE username/password, MAC validation, installation details, area filters and secure recoverable PPPoE password storage are not established in the current customer schema.
8. **Network integrations:** router records are inventory only. No live MikroTik RouterOS API, OLT/ONU vendor adapter or GenieACS/TR-069 adapter is implemented in the current build branch.
9. **Dashboard truthfulness:** the older main branch visibly contains sample metrics. The newer build branch requests dashboard data from the API; any remaining UI-only/demo values must be checked in browser testing.
10. **Multi-tenant integrity:** many route queries explicitly scope by authenticated user's tenant. This is a good start, but cross-tenant tests are required for every endpoint and related-record lookup. Database foreign keys do not visibly enforce tenant equality across all linked rows.
11. **Code maintainability:** much of the API and frontend logic is concentrated in large files. Refactor incrementally with tests; do not rewrite wholesale.
12. **Two competing backend designs:** MongoDB/Mongoose on main, SQLite on build, and D1/Worker scaffold. Keep one active runtime path until an approved migration strategy exists.

## 4. Tests and verification status

- Source includes `npm run check`, `npm test` and `npm run verify` in the build branch.
- Source includes `backend/scripts/smoke-test.js` and `.github/workflows/backend-checks.yml`.
- **Not run in this audit:** dependency installation, syntax checks, smoke tests, server startup, browser/mobile tests, database migration tests, or real router/OLT/ACS operations.
- The existence of a test script or CI workflow is not evidence that the current branch passes. Run the commands in Termux and record their actual output before Phase 1 is approved.

## 5. Termux compatibility

- The build branch declares Node.js `>=22.13` because it uses the built-in `node:sqlite` module.
- The backend dependencies are mostly pure JavaScript; SQLite is supplied by Node itself, avoiding an extra native npm SQLite package.
- Termux compatibility still needs a fresh install/test on the user's device. Keep the local database file private and backed up.
- A phone running Termux is suitable for local development/testing, but should not be treated as a reliable always-on production server or as the host for GenieACS.

## 6. Immediate recommendation

Preserve `build/nexus-isp-core` as the active product foundation. Continue on `dev`, review PR #1 separately, keep the Cloudflare Worker untouched, and complete a reproducible local verification before adding new modules. The first tenant label should be **Vancom Networks (Pvt) Ltd**; avoid seeding fake customers or financial records.
