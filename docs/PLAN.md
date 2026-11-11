# NEXUS Implementation Plan and Decisions

**Prepared:** 2026-11-11  
**Target first tenant:** Vancom Networks (Pvt) Ltd  
**Working branch:** `dev` (fast-forwarded to the current `build/nexus-isp-core` base)

## Recommended architecture

### 1. Database

**Recommendation: keep the current local SQLite implementation for the first Vancom local release.**

Reasons:
- It already exists in `build/nexus-isp-core`.
- Node's built-in `node:sqlite` avoids an additional native npm database driver.
- It works with a local-first Termux workflow and does not require a paid database account.
- Replacing it now with MongoDB or Cloudflare D1 would discard working implementation and add migration risk.

Important boundary:
- SQLite on one Termux device is appropriate for local development and a first single-instance deployment.
- A public multi-tenant SaaS with multiple app instances, concurrent users and remote availability needs a separate production database/hosting decision. Do not claim the local SQLite file is a scalable hosted SaaS database.
- Keep database access behind a repository/service layer so a later approved migration is manageable.
- Before any migration, require backup, dry-run, row-count reconciliation and restore testing.

**Approval needed:** approve SQLite for the local Vancom MVP and defer the hosted SaaS database decision until deployment architecture is designed.

### 2. Frontend

**Recommendation: keep the existing static HTML/CSS/JavaScript served by Express.**

Reasons:
- It is already integrated with the local API.
- It has no separate frontend build step, which is simpler on Android.
- Preserve the current mobile UI and improve it incrementally.
- Review PR #1 as a separate UI change; do not merge it automatically.

### 3. Backend

**Recommendation: keep the current Express JavaScript API for now.**

The active build branch is JavaScript ES modules and uses Node built-ins. The README on main's TypeScript/MongoDB direction is older than the current build branch. Do not convert to TypeScript or swap databases during the foundation phase without a measured reason and explicit approval.

Refactor into small route, service, validation and data-access modules incrementally. Enforce tenant scoping at the API/data layer.

### 4. Tests

**Recommendation: use the existing `npm run check`, `npm test` and `npm run verify` scripts first.**

- Run them from `backend/` on the user's Termux device.
- Keep the current smoke test as the first regression gate.
- Add Node's built-in test runner for focused unit tests where practical.
- Add cross-tenant denial tests, permission-denial tests and validation tests before calling any module complete.
- Add browser automation only if it installs reliably on the target environment; otherwise document manual viewport checks.

### 5. PDF generation

**Recommendation: defer PDF dependency selection until the invoice/receipt phase.**

Evaluate a pure-JavaScript library such as PDFKit or pdf-lib with a real Termux install test. Do not add a native dependency or claim PDF export is complete before producing and opening a sample invoice/receipt.

### 6. Scheduled jobs

**Recommendation: do not enable automatic billing or suspension initially.**

A Termux process can stop when Android kills the app or the phone sleeps. First implement idempotent manual invoice generation and test it. Only enable recurring jobs after choosing a reliable always-on host/scheduler and obtaining approval. Auto-suspension stays disabled until live router controls are verified.

### 7. Network integrations

- **MikroTik:** start with a read-only connection test and status adapter. Require least-privilege credentials, timeouts, audit logs and a dry-run before any write action.
- **OLT/ONU:** use the user's HSGQ-G04R as the first compatibility target. Ask for its supported management interface/firmware and do not invent vendor commands.
- **TR-069:** integrate through GenieACS NBI only after verifying URL, authentication, parameter paths and real device inform. GenieACS should run on a separate suitable server, not be assumed to run reliably on the phone.

### 8. Cloudflare Worker / D1

**Recommendation: leave `worker/` and its D1 schema untouched and undeployed for now.**

It is an incomplete parallel backend foundation. Do not mix Worker/D1 tables with the active SQLite application until a deliberate migration plan is approved.

## Phase order after approval

1. Reproduce the current build in Termux: install dependencies, run check/test/verify, start API, check health and sign in to the existing local database.
2. Review PR #1 and validate the UI changes separately; do not merge without test results.
3. Harden the foundation: config validation, migration framework, auth/session controls, validation schemas, tenant-scoped data layer and cross-tenant tests.
4. Complete staff/permission tests and audit activity.
5. Complete package lifecycle and package history.
6. Complete customer fields, safe soft deletion, search/filter/pagination and import preview.
7. Complete invoice numbering, idempotent billing, append-only ledger, receipts/PDF and reports.
8. Connect dashboard only to verified API data and display honest Not connected/Unknown states.
9. Implement MikroTik read-only integration, then controlled provisioning after dry-run approval.
10. Implement HSGQ-G04R inventory/status adapter after vendor method confirmation.
11. Implement GenieACS/TR-069 through the confirmed external ACS.
12. Finish tickets, reports, responsive audit, backup/restore and security review.

## Approval checklist

Please approve or change these decisions before Phase 1:
- [ ] Keep SQLite for the local Vancom MVP; defer hosted SaaS database decision.
- [ ] Keep Express JavaScript API and static HTML/CSS/JS frontend.
- [ ] Keep `dev` based on `build/nexus-isp-core`, not old `main`.
- [ ] Leave Cloudflare Worker/D1 undeployed and untouched.
- [ ] Keep automatic billing and customer auto-suspension disabled until explicitly approved.
- [ ] Review PR #1 separately; do not merge it yet.
