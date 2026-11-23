# NEXUS completion report — branch `claude/complete-on-main` (2026-11-23)

Base: `main` at `d2b83b9`. `main` was not modified. Nothing was deployed.

## Added in this branch
| Area | Change |
|---|---|
| Complaints | Per-tenant complaint numbers (`TKT-000001`), staff assignment, `resolved_at`, `ticket_history` table |
| Multi-tenant | `POST /api/v1/tenants/register`, `GET/PATCH /api/v1/tenant` (owner only) |
| SaaS plans | `tenants.plan` (starter/growth/pro) and `customer_limit`; creating a customer past the limit returns HTTP 402. Owners cannot change their own plan |
| Branding | `brand_color`, `support_phone`, `address`; Settings screen; colour applied to the dashboard theme |
| Dashboard API | `suspendedCustomers`, `expiringSubscriptions` (7 days), `dailyCollectionPkr`, `monthlyCollectionPkr`, `outstandingPkr` added to `GET /api/v1/dashboard` (old keys unchanged) |
| Local server | Serves `/sw.js` and `/manifest.webmanifest` |

Migrations (additive, transactional): `012_ticket_numbers_and_assignment`, `013_tenant_plan_branding`.
Existing workspaces are upgraded to plan `pro` (limit 100000) so nobody is locked out; new self-registered workspaces start on `starter` (100 customers).

## New / changed endpoints
- `GET /api/v1/tickets` — now includes `ticket_number`, `assigned_to`, `assigned_to_name`
- `PATCH /api/v1/tickets/:id` — body `{status?, assignedTo?}` (`assignedTo: null` unassigns; assignee must be an active staff member of the same tenant)
- `GET /api/v1/tickets/:id/history`
- `GET /api/v1/auth/me` — `tenant` now has `id,name,brand_color,plan`
- `PATCH /api/v1/tenant` — `{name?, brandColor?, supportPhone?, address?}`

## Verification performed
- `cd backend && npm run verify` passes (all earlier tests plus `scripts/tenant-isolation-tickets.test.js`).
- Migration upgrade tested against a database created by the previous code (existing tickets back-filled, new ticket numbered correctly).
- Headless Chromium at 390×844: login, Complaints (number, assign, status save), Settings (save, brand colour persists after reload).
- Original browser/migration verification used Node v22. The new CI matrix passed on both Node 22 and Node 26 in run `45116271628` (commit `166043a0c87d1aab31e3e004d587f9d6ab91aa89`).

## Follow-up completed during continuation
- Updated the dashboard activity panel to use server-calculated daily/monthly collection and outstanding receivables, plus suspended-customer and seven-day subscription-expiry counts. Existing customer/payment tables remain unchanged.
- Commit `166043a0c87d1aab31e3e004d587f9d6ab91aa89` passed Node 22/26 backend syntax/verification, backend E2E and tenant-isolation tests, production/staging smoke, migration reconciliation, SQLite-D1 sync contract, database hardening, and Android debug APK build. Latest APK artifact from that CI run: `nexus-android-debug-apk` (workflow `45116298532`, expires 2026-12-23). Later commits only remove a local-path symlink, clarify the hosted Settings API gap, and update documentation; a new CI run for the latest head was not returned during this audit.

## Additional audit fixes
- Removed the accidentally committed `backend/node_modules` absolute-path symlink (`/home/claude/nexus-isp-management/backend/node_modules`) from this PR branch. It must not be included in the merge.
- Added migration `013_tenant_plan_branding.sql` to the SQLite migration version registry.
- Expanded `.github/workflows/backend-checks.yml` to verify on Node 22 and 26.
- Confirmed the hosted D1 Worker on `main` does not expose `/api/v1/tenant`; updated the Settings screen to explain this hosted API gap instead of incorrectly telling every user they lack owner access. This small frontend fallback change was committed after the successful CI run and has not yet had a fresh CI result attached.

## Additional authentication smoke coverage
- Extended `.github/workflows/live-smoke.yml` to call `GET /api/tenant` without credentials against both production and staging and require HTTP 401. This verifies the new endpoint is protected without changing either environment.
- The previous Android debug APK workflow completed successfully and produced artifact `nexus-android-debug-apk` (3,732,713 bytes; run `45117819388`; expires 2026-12-23). A new APK build was triggered for the subsequent smoke-test commit and is still running at the time of this report update.

## Hosted D1 tenant-settings parity tranche
- Added `GET/PATCH /api/v1/tenant` to the Worker source on this branch, matching the local SQLite Settings screen contract.
- Both operations are owner-only and scoped to the authenticated `organization_id`; updates validate company name, hex brand colour, support phone and address, and write an audit event.
- Added an additive runtime D1 migration for `organizations.brand_color`. Existing phone/address columns are reused.
- The Worker returns `customer_limit: null` because hosted D1 plan-limit policy is not yet implemented; the UI now says the limit is not configured instead of inventing a number.
- `worker/wrangler.toml` targets `nexus-saas-api-staging` / `nexus-saas-staging-db`. No Worker deployment or D1 migration was run. This is source-level parity only, not deployed or production-verified.

## Frontend / hosted D1 API parity audit
- Added `docs/HOSTED-D1-FRONTEND-API-PARITY.md` after comparing frontend request paths with Worker routes.
- Confirmed that several frontend screens still call paths not implemented by the hosted Worker: dashboard summary, financial aging, payment promises, routers alias, tickets alias and TR-069/ACS management.
- These are not safe to alias blindly: ticket/complaint and router/network-device models need response-shape review; payment promises need a tenant-scoped schema; ACS connections require encrypted credentials.
- This audit documents blockers rather than exposing unfinished UI features as operational. No Worker deployment or D1 migration was run.

## Known limitations
- No UI to change plan and no payment collection for SaaS plans (plan is changed in the database). Hosted D1 customer-limit enforcement is also not implemented.
- Dashboard KPI cards now display daily/monthly collections, outstanding receivables, suspended customers and subscriptions expiring within seven days. The dashboard JavaScript change is included in commit `eba7e012c4f6d2ae7767fdeca6b885a6bca847f8`.
- Router, OLT and payment-gateway behaviour is not tested on real devices.
- `build/nexus-isp-core` and `main` have diverged and were not merged.
