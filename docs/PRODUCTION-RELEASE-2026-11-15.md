# NEXUS production release — 2026-11-15

## Release status

The production Worker customer-portal release is deployed and live smoke verification passed after the 2026-11-15 security logging update. This is a verified release of the Cloudflare Worker/D1 portal path, not a certification that every NEXUS module or hardware integration is complete.

## Deployed resources

| Resource | Release result |
|---|---|
| Production Pages | `https://nexus-isp-management.pages.dev` |
| Customer portal | `https://nexus-isp-management.pages.dev/portal/` |
| Production API | `https://nexus-saas-api.harissaeed030.workers.dev` |
| Staging API | `https://nexus-saas-api-staging.harissaeed030.workers.dev` |
| Production Worker | `nexus-saas-api`, version 25 |
| Production Worker version ID | `7f85ed27-e3bc-47bd-9ebc-24a6a0e04dfb` |
| Production Worker deployment ID | `b4a6723b-6ba8-4e5a-b8a1-f2c8855b57b4` |
| Traffic allocation | 100% to version 25 |
| Previous Worker version | `ddba4576-e9ec-4db8-a93a-dc80c5a35b1e` (version 24) |
| Production Pages deployment | `9050c002-80de-4a24-9f3d-12c7ef1da7c5` |
| Pages commit | `d9a05ff97ce4d3fde27a4457ffac5f30a0be90d6` |

Staging Worker version 18 (`d79d6f84-62eb-4339-8dbd-927a4aa109a1`) is deployed at 100% traffic. Production Worker version 25 and staging version 18 both redact organization identifiers and raw exception text from application logs. Existing D1 bindings and `ALLOWED_ORIGINS`, `JWT_SECRET`, and `TURNSTILE_SECRET_KEY` secret bindings were preserved. Secret values were not read into source or copied into GitHub.

## Database

Production and staging are both at D1 migration 0009. Migrations 0007 and 0008 added customer portal tenant guards and user-email indexes; migration 0009 repaired the explicit global email index that a live recheck found missing in production. All migrations were applied additively after fresh D1 SQL exports and duplicate-email preflight. Both databases now have the global unique email index, case-insensitive organization email index, and organization lookup index. No production customer, invoice or payment rows were rewritten.

Live counts after migration 0009: production has 1 organization, 1 user, 0 customers, 0 invoices and 0 payments; staging has 7 organizations, 7 users, 7 customers, 2 invoices and 0 payments. The production and staging `users` table definitions still differ in legacy defaults/nullability; no table rebuild was attempted.

Backup export:

- File: `ce88098b-bff4-4d06-a0df-7bf29622a085-0000007f-00000000-00005124-3d10acf27af286f65269ddf3b096b78f.sql`
- Bookmark: `0000007f-00000000-00005124-3d10acf27af286f65269ddf3b096b78f`

## Implemented and verified in this release

- Production Worker security headers and CORS preflight behavior.
- Production/staging API health and D1 connectivity.
- Authentication guard and JWT-expiry checks.
- Customer portal UI now calls the deployed Worker origin and current API routes.
- Portal login supports account number, tenant-slug/account-number and email identity.
- Legacy `/api/v1/customer-portal/*` aliases remain supported.
- Customer portal profile, dashboard, invoice/payment history and complaint-ticket API flows.
- Multi-tenant customer isolation and portal-account provisioning guards.
- Production Worker excludes the staging-only synthetic-tenant cleanup route.
- D1 migration v6-to-v9 validation, cross-tenant insert/update guard tests, and live verification of all three user-email indexes in both environments.
- Production/staging Worker error-log redaction; source and deployed script checks confirm no raw organization IDs or exception text in the targeted audit/scheduled error logs.
- Scheduled/manual staging portal E2E workflow and production/staging live smoke workflow.

## Automated evidence

The following GitHub Actions runs completed successfully:

- PR #42: backend checks, database hardening, backend verification and live smoke.
- PR #43: staging tenant/customer portal E2E.
- PR #44: production Worker static checks and D1 v6-to-v7 migration validation.
- PR #46: portal API contract, staging identity-login E2E and live smoke.
- PR #45: production candidate preview smoke, Pages portal route and post-deployment production portal auth guard.
- Main push after the 2026-11-15 Worker security deployments: [live smoke run 43732343513](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43732343513) passed production and staging endpoint verification.
- PR #53 (migration 0008), PR #54 (Worker log redaction), and PR #55 (migration 0009 repair) were merged after their automated checks passed.

The staging E2E suite created two synthetic tenants and removed both in its cleanup step.

## Remaining work — not certified complete

1. **RouterOS/MikroTik live verification:** adapter tests pass, but no live router session was tested. Requires a reachable router, API service enabled and authorized credentials.
2. **HSGQ OLT/ONU:** the current adapter does not claim live control without a documented vendor API. Vendor API documentation and credentials are still required.
3. **TR-069/ACS:** GenieACS adapter tests do not prove live Huawei ONU inform/configuration. ACS URL, credentials, reachable test ONU and device inform logs are required.
4. **Full admin-module E2E:** packages, subscriptions, invoice generation, payments/refunds, staff permissions, reports and exports still need a complete staging scenario covering each endpoint and UI action.
5. **SQLite/D1 data synchronization:** the two backends have documented separate runtime boundaries; bidirectional synchronization and data migration are intentionally not implemented. Do not treat the local SQLite database as production data.
6. **Backup/restore rehearsal:** fresh production and staging D1 exports were completed before migration 0009, but a full restore rehearsal into an isolated D1 database has not yet been documented.
7. **Production customer acceptance:** production currently has no customer, invoice or payment records. The portal flow was exercised with synthetic staging tenants, not real customer accounts.

Do not describe the entire SaaS as error-free or all modules as complete until these remaining integration and acceptance tests pass.
