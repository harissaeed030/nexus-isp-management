# NEXUS Portal, Security and Recovery Verification

**Date:** 2026-11-14  
**Source under review:** `feat/customer-portal-automated-billing` (PR #21)  
**Environment:** Cloudflare staging D1 `nexus-saas-staging-db`  
**Decision:** **HOLD — production release is not approved.**

## 1. Customer portal end-to-end

### Source review
PR #21 contains:
- `portal.html` and `assets/js/customer-portal.js`.
- Customer-specific login, profile, subscription, invoice, payment, ticket and password flows.
- Owner/admin customer portal account provisioning and disable/reset routes.
- A Worker-side migration that creates `customer_portal_accounts`.

The PR's verification records syntax checks and staging HTTP journey evidence, but not a complete browser-driven Android Chrome test. The recorded journey reaches customer login, reads, invoice visibility, complaint submission and logout. The final HTTP 401 assertions after logout are not independently confirmed from retrievable workflow logs.

### Staging verification
The staging Worker candidate `nexus-saas-api-staging` is deployed at 100% on version `606fc507-5d62-4cff-bef6-9ebe19714271`, bound to `nexus-saas-staging-db`. The additive `customer_portal_accounts` table exists in staging.

Staging D1 read-only inventory currently shows 24 application tables, including `customer_portal_accounts`. Counts are zero for organizations, users, customers, packages, subscriptions, invoices, payments, portal accounts, support tickets, audit log and notifications. This confirms the database is clean now; it does not by itself prove a full browser E2E pass.

The repeatable HTTP E2E script is `worker/scripts/staging-portal-e2e.mjs`, with a manual-only workflow at `.github/workflows/staging-portal-e2e.yml`. The script creates a synthetic tenant and associated records but does not implement a cleanup/finally phase. The previously recorded synthetic data cleanup was performed separately. **Do not rerun the workflow until automatic cleanup is implemented or a documented cleanup procedure is guaranteed**, otherwise test records may accumulate.

### Remaining portal tests
1. Run the full HTTP E2E assertions and retain workflow logs, including revoked-token and unauthenticated admin 401 results.
2. Verify incorrect credentials, disabled portal account and wrong workspace.
3. Verify cross-customer invoice and ticket IDs return no data.
4. Change password; verify old password and old token are rejected.
5. Verify disable/reset revokes existing tokens.
6. Run Android Chrome viewport, keyboard, form and invoice-print checks.
7. Add safe synthetic-tenant cleanup to the automated test lifecycle.

**Portal status:** staging flow evidenced through logout and complaint submission; final 401 assertions and browser/mobile checks remain unverified.

## 2. Security review

This is an **internal source/configuration review**, not an independent third-party penetration test or certification.

### Source observations
- The portal candidate logs D1 audit-write failures server-side but does not fail closed. Critical financial audit atomicity and alerting still require review.
- Portal JWTs carry customer principal, organization, customer, token version and expiry claims. Portal data queries inspected are scoped by organization and customer.
- Customer portal login uses the shared IP/email login-attempt limiter.
- Password change, disable/reset and logout increment the portal token version.
- The PR #25 production security patch remains separate from the portal PR. It fixes JWT expiry enforcement, exact-origin CORS, malformed dashboard URL validation, owner-role registration and audit failure logging.
- The production Worker currently does **not** contain those security fixes or the customer portal routes; see the live inventory below.

### Independent review status
**NOT COMPLETED.** An independent reviewer must be someone other than the implementer. Review authentication, authorization, tenant isolation, XSS/CSRF, CORS, rate limits, secrets, logging, data export, payment/refund integrity and recovery controls. Record findings and remediate Critical/High issues before release.

### Internal findings requiring closure
- Audit-write failures are logged but not fail-closed. Financial mutations and audit records should be atomic where required, with alerting and tested failure behavior.
- Verify portal cross-customer IDOR rejection, disabled-account rejection, old-token rejection and password-change revocation using automated HTTP tests.
- Complete independent review and document findings; an internal source review must not be labelled independent.

## 3. Backup and restore drill

### Backup/export completed
A D1 SQL export was successfully completed for the **staging database only**:
- Database: `nexus-saas-staging-db`
- Database ID: `194f62e2-2766-48ab-be17-81248610c0cd`
- Export status: complete
- Latest recorded export bookmark: `00000016-00000000-00005123-bf2291ec0cc44577ea35ecc31763f492`
- Latest recorded export file: `194f62e2-2766-48ab-be17-81248610c0cd-00000016-00000000-00005123-bf2291ec0cc44577ea35ecc31763f492.sql`

The signed export URL is temporary and is intentionally not committed to GitHub.

### Restore status
**NOT COMPLETED.** No import into a separate disposable D1 database was performed. An export is not a proven recoverable backup until a separate restore succeeds.

Required drill:
1. Create a separate disposable D1 database, never production.
2. Import the staging SQL export into that disposable database.
3. Poll until import reports complete.
4. Compare table, index, trigger and migration-ledger counts.
5. Run application smoke tests against the restored copy.
6. Record restore duration (RTO) and export bookmark/time (RPO).
7. Delete the disposable database only after retaining evidence.

No production database creation, import, restore, migration or write was attempted during this audit.

## 4. Live Cloudflare inventory recheck

Read-only Cloudflare API inventory was performed on 2026-11-14. No Worker, D1, secret or production customer data was changed by this recheck.

### Production Worker
- Worker: `nexus-saas-api`
- Current deployment: 100% traffic on version 17
- Version ID: `7f478bc5-8b7d-4e62-8ad7-4cde9f37db6d`
- Version creation/deployment time: `2026-11-14T05:04:18.363392Z`
- D1 binding: `DB` → production database `nexus-saas-db`
- Current deployed script inspection: placeholder frontend response is present; customer portal routes/table migration and the PR #25 JWT/CORS/audit hardening markers are absent.

This deployment inventory is important because earlier notes described version 16 as the production version and recorded that production deployment approval had been withheld. Version 17 is now the live 100% deployment. The reason for that intervening upload/deployment is not established by this read-only audit. Do not assume it is the portal release or deploy another version until the deployment history is reconciled.

### Production D1
- Database: `nexus-saas-db`
- Database ID: `ce88098b-bff4-4d06-a0df-7bf29622a085`
- 23 application tables are present.
- `customer_portal_accounts` is absent.
- Read-only counts: 1 organization, 1 user, 0 customers, 0 subscriptions, 0 invoices, 0 payments and 29 audit-log rows.
- Production schema and data were not modified by this audit.

### Staging
- Worker: `nexus-saas-api-staging`
- Current deployment: 100% traffic on version 7, ID `606fc507-5d62-4cff-bef6-9ebe19714271`
- Staging D1 contains `customer_portal_accounts` and 24 application tables.
- Current relevant business/test row counts are zero.

## 5. GitHub verification and release decision

- PR #21 (customer portal) remains open/draft.
- PR #23 (this verification document) remains open.
- PR #25 (production Worker security hardening) remains open on `dev`; it is not the deployed production Worker.
- GitHub Actions Worker checks run #75 completed successfully. This is a syntax check, not a runtime security review or production acceptance test.

| Workstream | Status |
|---|---|
| Portal source review | Complete |
| Staging portal journey | Partial pass: journey evidence through logout/complaint; final 401 assertions and Android browser checks unverified |
| Staging synthetic-data cleanup | Current D1 counts zero; E2E script still needs automatic cleanup |
| Internal security review | Partial; findings recorded |
| Independent security review | Not completed |
| Staging D1 SQL export | Complete |
| Restore into disposable D1 | Not completed |
| Production Worker portal/security release | Not deployed; current production script lacks portal and hardening |
| Production D1 changes | None |

**Release decision: NO-GO.** Do not merge/deploy the portal or security candidate to production until the independent review, final HTTP/browser assertions, automated test cleanup, disposable restore drill and production deployment-history reconciliation are complete.
