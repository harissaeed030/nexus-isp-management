# NEXUS completion report — branch `build/nexus-isp-core` (2026-11-23)

Base: `build/nexus-isp-core` at `4d38f63`. Nothing was deployed.

## Added in this branch
| Area | Change |
|---|---|
| Complaints | Per-tenant complaint numbers (`TKT-000001`), staff assignment, `resolved_at`, `ticket_history` table |
| Multi-tenant | `POST /api/v1/tenants/register`, `GET/PATCH /api/v1/tenant` (owner only) |
| SaaS plans | `tenants.plan` (starter/growth/pro) and `customer_limit`; creating a customer past the limit returns HTTP 402. Owners cannot change their own plan |
| Branding | `brand_color`, `support_phone`, `address`; Settings screen; colour applied to the dashboard theme |
| Dashboard API | `suspendedCustomers`, `expiringSubscriptions` (7 days), `dailyCollectionPkr`, `monthlyCollectionPkr`, `outstandingPkr` added to `GET /api/v1/dashboard` (old keys unchanged) |

Migrations (additive, transactional): `013_ticket_numbers_and_assignment`, `014_tenant_plan_branding`.
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
- Test Node version: v22. Not yet run on Node v26 or on a physical Android device.

## Known limitations
- No UI to change plan and no payment collection for SaaS plans (plan is changed in the database).
- Dashboard cards do not yet display the new KPI fields (API only).
- Router, OLT and payment-gateway behaviour is not tested on real devices.
- `main` and this branch have diverged; the same features were also applied on `claude/complete-on-main`.
