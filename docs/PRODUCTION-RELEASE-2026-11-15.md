# NEXUS production release — 2026-11-15

## Release status

The production Worker customer-portal release is deployed and the production live smoke workflow passed. This is a verified release of the Cloudflare Worker/D1 portal path, not a certification that every NEXUS module or hardware integration is complete.

## Deployed resources

| Resource | Release result |
|---|---|
| Production Pages | `https://nexus-isp-management.pages.dev` |
| Customer portal | `https://nexus-isp-management.pages.dev/portal/` |
| Production API | `https://nexus-saas-api.harissaeed030.workers.dev` |
| Staging API | `https://nexus-saas-api-staging.harissaeed030.workers.dev` |
| Production Worker | `nexus-saas-api`, version 22 |
| Production Worker version ID | `9944c775-2357-4d23-ac27-191fc41c0505` |
| Production Worker deployment ID | `75ddbdc4-57f2-427f-8827-ba91c66c5e3b` |
| Traffic allocation | 100% to version 22 |
| Previous Worker version | `8db657aa-8973-4f44-97d4-c8156486501b` |
| Production Pages deployment | `9050c002-80de-4a24-9f3d-12c7ef1da7c5` |
| Pages commit | `964b7d70b088ec79a113671476d5449aafae2ad4` |

The production Worker version inherited the existing production D1 binding and secret bindings. Secret values were not read into source or copied into GitHub.

## Database

Production and staging are both at D1 migration 0007.

Migration 0007 created the customer portal account table and its insert/update tenant-integrity triggers. It was applied additively after a full Cloudflare D1 SQL export. No production customer, invoice or payment rows were rewritten.

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
- D1 v6-to-v7 migration parity and cross-tenant insert/update guard tests.
- Scheduled/manual staging portal E2E workflow and production/staging live smoke workflow.

## Automated evidence

The following GitHub Actions runs completed successfully:

- PR #42: backend checks, database hardening, backend verification and live smoke.
- PR #43: staging tenant/customer portal E2E.
- PR #44: production Worker static checks and D1 v6-to-v7 migration validation.
- PR #46: portal API contract, staging identity-login E2E and live smoke.
- PR #45: production candidate preview smoke, Pages portal route and post-deployment production portal auth guard.
- Main push after release: live smoke verified production health, D1, CORS, security headers, unauthenticated portal guard and Pages portal page.

The staging E2E suite created two synthetic tenants and removed both in its cleanup step.

## Remaining work — not certified complete

1. **RouterOS/MikroTik live verification:** adapter tests pass, but no live router session was tested. Requires a reachable router, API service enabled and authorized credentials.
2. **HSGQ OLT/ONU:** the current adapter does not claim live control without a documented vendor API. Vendor API documentation and credentials are still required.
3. **TR-069/ACS:** GenieACS adapter tests do not prove live Huawei ONU inform/configuration. ACS URL, credentials, reachable test ONU and device inform logs are required.
4. **Full admin-module E2E:** packages, subscriptions, invoice generation, payments/refunds, staff permissions, reports and exports still need a complete staging scenario covering each endpoint and UI action.
5. **Backend architecture reconciliation:** the repository contains a local Node/SQLite backend and a production Cloudflare Worker/D1 backend. Their responsibilities and deployment path still need to be unified/documented.
6. **Development branch integration:** `build/nexus-isp-core` was observed to be 164 commits ahead and 4 commits behind `main`. It was not force-merged; its differences need review and reconciliation before declaring the entire development branch integrated.
7. **Production customer acceptance:** production currently has no customer, invoice or payment records. The portal flow was exercised with synthetic staging tenants, not real customer accounts.

Do not describe the entire SaaS as error-free or all modules as complete until these remaining integration and acceptance tests pass.
