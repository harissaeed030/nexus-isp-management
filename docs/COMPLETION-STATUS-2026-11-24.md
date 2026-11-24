# NEXUS completion status — 2026-11-24

## Current decision

**Core hosted software and D1 reconciliation: verified. Full ISP production acceptance: still NO-GO.**

This status separates code/Cloudflare work that has passed from real-world integrations and acceptance work that cannot be proven by repository tests alone.

## Completed in this work session

### GitHub and Worker code
- Merged PR #106: restored deployed migration history 0010–0021 and added D1 reconciliation migrations 0022, 0024 and 0025.
- Merged PR #107: aligned the staging Worker implementation with the production Worker while retaining the staging-only E2E tenant cleanup route.
- Merged PR #108: expanded staging E2E for tenant-isolated payment promises and encrypted router inventory; corrected customer response-envelope handling.
- Production Worker source was not changed or redeployed by these PRs.
- Staging Worker version 38 was deployed with production module parity and its staging-only cleanup endpoint.
- `NETWORK_CONNECTOR_ENABLED=false` remains in place.

### D1 production and staging
- Exported fresh SQL backups to Cloudflare R2 before the final production migration sequence. The export files remain in the Cloudflare R2 export area; no local downloadable copy was produced in this session.
- Applied migrations in order: 0022, 0024, 0025 to staging first, then production.
- Both databases now contain `sync_state` and `payment_promises.updated_by`.
- Both databases enforce unique sync-record keys and workspace-scoped case-insensitive user email uniqueness; the global email unique index is absent.
- Latest read-only verification: 0 foreign-key violations in both databases, 0 duplicate user emails within a workspace, and 0 synthetic `nexus-stage-%` workspaces in either database.
- Production customer/user records were not deleted or rewritten as part of this work.

### Automated and live verification
- Staging tenant-isolation/customer-portal E2E passed, including payment promises, cross-tenant rejection, encrypted router inventory, customer portal login/dashboard/tickets/logout, and cleanup.
- Backend checks, schema reconciliation rehearsal, syntax checks and endpoint smoke checks passed on the merged candidate.
- Production live-smoke rerun passed after the initial health-check attempt encountered Cloudflare's temporary `Currently processing a long-running export` response. The later rerun completed successfully.
- Cloudflare Pages production deployment for commit `c608209983303ccc0f1147cfe05daf5a873b445f` completed successfully.
- Cloudflare Workers Observability currently reports no active issues for `nexus-saas-api`.

## Still not complete / must not be advertised as live

1. **MikroTik live connector:** production inventory stores encrypted credentials, but live RouterOS commands remain disabled. The current architecture needs an always-on Linux connector on the trusted LAN; a phone that is powered off or disconnected cannot act as that connector.
2. **HSGQ-G04R / Huawei ONU live control:** no official API schema, MIB/OID set or authorized lab test credentials have been verified. Inventory is not live OLT telemetry.
3. **TR-069 / GenieACS:** live ACS credentials and an authorized test ONU/inform cycle are still required.
4. **Payments:** invoice/payment records and workflows exist, but a live payment-gateway integration has not been configured or verified.
5. **Android acceptance:** automated checks do not replace physical Chrome/WebView testing on the target Android device and real owner/staff/customer accounts.
6. **Independent security review:** no attributable independent assessment has been completed.
7. **Worker-runtime password benchmark:** PBKDF2 remains at 100,000 iterations pending a measured Cloudflare Worker CPU-budget benchmark. Do not raise iterations by guessing.
8. **Backup restore drill:** D1 SQL exports were completed, but a full restore into isolated D1 databases and schema/row-count comparison has not yet been recorded.

## Open work intentionally not merged

- PR #109 is still a draft for opt-in email password recovery. It requires a verified email provider and Worker secrets (`RESEND_API_KEY`, `PASSWORD_RESET_FROM`, `PASSWORD_RESET_URL`) before delivery can work; no secrets were added.
- Older conflicting/duplicate PRs remain open and were not merged blindly.
- PR #110, a one-off stale-test cleanup PR, was closed without merging after the staging database verification showed zero synthetic workspaces.

## Safety record

- No production customer, invoice or payment data was deleted.
- No production Worker source or secrets were changed in this session.
- No live MikroTik, PPPoE, HSGQ OLT, Huawei ONU or ACS configuration command was sent.
- Green Fiber Net Pages and its Gemini proxy were left untouched.

## Final status

The hosted NEXUS core, database schema reconciliation, staging/production smoke checks and Pages deployment are in a healthy verified state. The complete ISP service is **not yet fully production-certified** until the real device connector, ACS/OLT verification, payment gateway, Android acceptance, security review and restore drill are completed.


## Additional live recheck — 2026-11-24 (read-only)

A follow-up check of the Cloudflare account was performed after the completion report above was written:

- Production Worker `nexus-saas-api`: deployment version 36 is serving 100% traffic (deployed 2026-11-24 08:53 UTC). Its D1 binding points to the production database ID recorded in this report. Worker logs and traces are enabled.
- Staging Worker `nexus-saas-api-staging`: deployment version 38 is serving 100% traffic (deployed 2026-11-24 09:11 UTC). Its D1 binding points to the staging database ID recorded in this report. Worker logs and traces are enabled.
- Read-only `sqlite_master` checks confirmed both databases contain the expected hosted application tables, including `sync_state`, `payment_promises`, `router_credentials`-related inventory tables, and TR-069 inventory tables. No rows were written by these checks.
- The live migration ledgers are **not byte-for-byte identical**: production includes ID 101 (`2026-11-17-staging-schema-additive-reconcile`) while staging does not; both contain IDs 1–22, 24, 25 and 100, but the recorded name for ID 11 differs. This is a ledger-history discrepancy, not evidence that a new migration should be applied. Do not fabricate ledger entries or rerun historical migrations to make the lists look identical; reconcile the naming/history through a reviewed forward-only plan.
- Cloudflare's R2 bucket-list API returned error 10042 (“Please enable R2 through the Cloudflare Dashboard”). Therefore this session could not independently list/verify the previously reported backup objects or complete an isolated restore drill. The restore drill remains open; no backup was deleted or overwritten.

This recheck was read-only. It did not deploy Workers, mutate D1, change secrets, or contact ISP network devices.


### Final verification after documentation deployment

- The two final read-only D1 checks again returned 0 foreign-key violations and 0 duplicate case-insensitive user emails within an organization in both production and staging.
- Both databases returned 0 synthetic `nexus-stage-%` organizations.
- The Pages production deployment for the README/report refresh (commit `ab77544d76ec0c05885e06808cc50bdc1ef4f7fe`) completed successfully. Production URL remains https://nexus-isp-management.pages.dev.


## Password recovery rollout and follow-up hardening — 2026-11-24

- PR #109 (`b12a3e96a94ab3b9496ecfd33233cf071e3f72be`) merged the hosted owner/staff password-recovery flow. Its eight CI checks passed.
- The merged recovery flow is deployed to both Workers: staging version 39 and production version 40, each serving 100% traffic at the time of rollout. Existing D1 and secret bindings were preserved.
- A code review then found that reset attempts shared the normal login throttle bucket. PR #112 isolated both reset-request and token-consumption rate-limit keys from login rate limits, with regression coverage. All seven PR checks passed; the fix merged as `750ba9e28281e51f6a12f62d5b7e4045d87bf817`.
- Latest Workers after PR #112: staging version 41 and production version 41, each verified at 100% traffic. Production remains bound to production D1; staging remains bound to staging D1. All pre-existing secret-text, D1 and plain-text binding names remain present.
- Cloudflare Pages production deployment for merge commit `750ba9e28281e51f6a12f62d5b7e4045d87bf817` completed successfully.
- Password recovery is deployed but email sending remains **disabled** until a valid `RESEND_API_KEY` and verified `PASSWORD_RESET_FROM` sender are configured in both intended environments. The `PASSWORD_RESET_URL` secret binding is present in both Workers; its secret value was not read or changed. No API key or sender identity was invented.

### Additional D1 schema inspection

A read-only comparison of `sqlite_master` found that the production and staging databases have some differing table/index SQL definitions and four staging-only triggers (network connector/job tenant guards and two users password-hash guards). The `users` table also differs: production has `password_hash NOT NULL` and role default `staff`; staging has a nullable legacy column plus triggers rejecting empty hashes, and role default `member`. The staging password-hash trigger difference is explicitly documented by migration 0017 as a compatibility mechanism because production already has the stricter constraint. Do not attempt a blind schema rebuild or force ledger parity. A reviewed schema-by-schema parity plan remains open for the remaining DDL/index differences.

This rollout changed Worker code only. It did not alter customer, invoice or payment records, activate the network connector, or send commands to any MikroTik, OLT, ONU or ACS device.


### Final post-CI verification — 2026-11-24

- PR #112's staging E2E run briefly created four synthetic `nexus-stage-%` organizations while the tests were active. The test cleanup completed; a later read-only check confirmed 0 synthetic organizations in both production and staging.
- Final read-only D1 checks: 0 foreign-key violations and 0 duplicate case-insensitive user emails within an organization in both environments.
- Latest Worker deployments remain production v41 and staging v41 at 100% traffic with the expected isolated D1 bindings.
- The README/completion-report Pages deployment is being refreshed from the latest main-branch documentation commit; the application deployment from PR #112 is already successful.
