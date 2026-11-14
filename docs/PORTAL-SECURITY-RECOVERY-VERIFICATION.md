# NEXUS Portal, Security and Recovery Verification

**Date:** 2026-11-14  
**Source under review:** `feat/customer-portal-automated-billing` (PR #21)  
**Environment:** Cloudflare staging D1 `nexus-saas-staging-db`  
**Decision:** **HOLD — no production deployment or data changes.**

## 1. Customer portal end-to-end

### Source review
PR #21 contains:
- `portal.html` and `assets/js/customer-portal.js`.
- Customer-specific login, profile, subscription, invoice, payment, ticket and password flows.
- Owner/admin customer portal account provisioning and disable/reset routes.
- A Worker-side migration that creates `customer_portal_accounts`.

The PR's own verification records syntax checks and local in-memory SQLite checks, not a complete browser-to-Worker-to-D1 end-to-end test.

### Staging verification
A read-only query of staging D1 initially returned 23 tables and confirmed `customer_portal_accounts` was missing. The isolated candidate Worker is deployed to `nexus-saas-api-staging` (version `606fc507-5d62-4cff-bef6-9ebe19714271`, 100% traffic), bound to `nexus-saas-staging-db`, with the existing `JWT_SECRET` binding retained. Because the Worker HTTP endpoint could not be reached from this verification runtime, the exact additive `CREATE TABLE IF NOT EXISTS customer_portal_accounts` migration was applied directly to the empty staging D1.

A staging-only database smoke test then inserted a synthetic organization, customer and portal account and read the row back successfully. Duplicate customer-account and invalid-status constraints both rejected invalid inserts. The synthetic organization was deleted and the portal-account table was verified to contain zero remaining smoke-test rows. Staging currently has zero organizations, users, customers, invoices, payments and subscriptions.

A repeatable HTTP E2E script (`worker/scripts/staging-portal-e2e.mjs`) and GitHub Actions workflow (`.github/workflows/staging-portal-e2e.yml`) were added to PR #21. `node --check` passed locally. Staging D1 audit records confirm the automated journey executed tenant registration, customer creation, package creation, subscription creation, invoice creation, portal-account provisioning, customer portal login and complaint submission. The portal account `token_version` incremented to 1, confirming the logout operation executed. The complaint was created only under the synthetic tenant; the script's invoice visibility assertion occurs before complaint submission, so that check also passed. The GitHub workflow log itself is not retrievable through the available connector, so the final HTTP status assertions after logout (revoked-token and unauthenticated admin rejection) are not independently confirmed from run logs.

All synthetic tenant records (organization, owner, customer, package, subscription, invoice, portal account, ticket, audit entries and notification) were explicitly deleted from staging after verification. A fresh count query returned zero rows in organizations, users, customers, packages, subscriptions, invoices, payments, customer portal accounts, support tickets, audit log and notifications. Therefore the staging portal E2E journey is **PASS through logout and complaint submission; final 401 assertions log-unverified**. Do not run this migration against production as part of this test.

### Required E2E cases after staging integration
1. Provision a synthetic customer portal account as owner/admin.
2. Login with correct and incorrect workspace/email/password combinations.
3. Verify disabled account and revoked token rejection.
4. Verify profile, subscriptions, invoices, payment history and complaint listing.
5. Submit a complaint and verify it appears only for the same customer.
6. Change password; verify old password and old token are rejected.
7. Attempt cross-customer invoice/ticket IDs and verify no data is disclosed.
8. Verify logout revokes the session.
9. Run Android Chrome viewport and keyboard/form checks.

Use only synthetic data and a disposable staging tenant.

## 2. Security review

This is an **internal source/configuration review**, not an independent third-party penetration test or certification.

### Confirmed source observations
- The portal candidate now logs D1 audit-write failures server-side; it does not yet fail closed. Critical financial audit atomicity and alerting still require review.
- JWT verification now rejects tokens without a numeric, future `exp` claim.
- CORS now requires an exact configured origin (plus the exact canonical Pages origin); arbitrary Pages preview subdomains are not implicitly trusted.
- The production `dev` Worker has a separate security patch in PR #25; it is not deployed. Production Worker/D1 remain unchanged.
- The source has IP/email login-attempt tracking for staff authentication. Verify that the customer portal login path is also throttled and covered by automated tests.
- Verify customer JWTs always include a principal type, organization ID, customer ID, token version and expiry; every portal query must constrain both organization and customer.
- Verify password change, reset, disable and logout all increment token version and that old tokens fail immediately.

### Independent review status
**NOT COMPLETED.** An independent reviewer must be someone other than the implementer. The review should cover authentication, authorization, tenant isolation, XSS/CSRF, CORS, rate limits, secrets, logging, data export, payment/refund integrity and recovery controls. Record findings and remediate Critical/High issues before release.

## 3. Backup and restore drill

### Backup/export completed
A D1 SQL export was successfully completed for the **staging database only** using Cloudflare's D1 export workflow:
- Database: `nexus-saas-staging-db`
- Database ID: `194f62e2-2766-48ab-be17-81248610c0cd`
- Export format: D1-compatible SQL
- Export status: `complete`
- Export file: `194f62e2-2766-48ab-be17-81248610c0cd-00000014-00000000-00005123-3090f9b8bbcbc9899f98314f00f7b5a2.sql`

The signed export URL is temporary and is intentionally not committed to GitHub.

A fresh staging export was also completed on 2026-11-14 after the staging Worker candidate was deployed:
- Export bookmark: `00000016-00000000-00005123-bf2291ec0cc44577ea35ecc31763f492`
- Export file: `194f62e2-2766-48ab-be17-81248610c0cd-00000016-00000000-00005123-bf2291ec0cc44577ea35ecc31763f492.sql`
- Export status: `complete`

The verification environment could not retrieve the temporary R2 download URL or upload the SQL to a disposable D1 database. Therefore the restore drill remains **NOT COMPLETED**; do not treat either export as a proven recoverable backup until a separate restore succeeds.

### Restore status
**NOT COMPLETED.** No import into a separate disposable D1 database was performed, so this export is not yet a proven recoverable backup. A successful restore drill must:
1. Create a separate disposable D1 database.
2. Import the SQL export into that database.
3. Poll until the import reports complete.
4. Compare table/index/trigger counts and migration ledger.
5. Run application smoke tests against the restored copy.
6. Record restore duration (RTO) and the export bookmark/time (RPO).
7. Delete the disposable database only after evidence is retained.

Do not import into, reset, or restore over production. Do not treat the staging export as a verified backup until the restore and application checks pass.

## 4. Production safety

- No production D1 export/import, migration, query write or restore was performed.
- No production Worker or Pages deployment was performed.
- No production secrets were read or changed.
- The work above includes read-only production checks, an additive migration and temporary synthetic-fixture writes in staging only; all synthetic fixtures were deleted.

## Final gate status

| Workstream | Status |
|---|---|
| Portal source review | Complete |
| Portal D1 schema smoke test | Pass: additive table created, insert/read and constraint checks passed, fixtures cleaned |
| Portal HTTP/API E2E | Pass through complaint submission and logout (staging audit/token-version evidence); final 401 assertions log-unverified |
| Staging synthetic-data cleanup | Pass: all test tenant rows removed; fresh counts are zero |
| Internal security review | Source fixes prepared; runtime security tests pending |
| Independent security review | Not completed; requires separate reviewer |
| Staging D1 SQL export | Complete |
| Restore into disposable D1 | Not completed |
| Production changes | None |

**Release decision: NO-GO until portal E2E, security remediation/independent review and restore verification are completed.**
