# Hosted frontend ↔ Worker API contract gap audit

**Reviewed:** 2026-11-17  
**Scope:** static source comparison of `assets/js/app.js` on `main` and `worker/src/production-worker.js` on `main`. This is not a live endpoint test.

## Important architecture detail

The Pages dashboard defaults to `https://nexus-saas-api.harissaeed030.workers.dev`. The Worker removes the `/api/v1/` prefix before dispatching, so a frontend request to `/api/v1/x` is dispatched internally as `/api/x`.

The local Node/SQLite backend is a separate runtime. Its route names must not be assumed to exist in the hosted Worker.

## Frontend calls with corresponding Worker route

| Frontend request | Worker dispatch path | Source-level status |
|---|---|---|
| `/api/v1/customers` | `/api/customers` | Matching route family exists |
| `/api/v1/packages` | `/api/packages` | Matching route family exists |
| `/api/v1/subscriptions` | `/api/subscriptions` | Matching route family exists |
| `/api/v1/invoices` | `/api/invoices` | Matching route family exists |
| `/api/v1/payments` | `/api/payments` | Matching route exists |
| `/api/v1/staff` | `/api/staff` | Matching route family exists |
| `/api/v1/auth/me` | `/api/auth/me` | Matching route exists |
| `/api/v1/auth/logout` | `/api/auth/logout` | Matching route exists |
| `/api/v1/audit-logs` | `/api/audit-logs` | Matching route family exists |
| `/api/v1/billing/generate` | `/api/billing/generate` | Matching route exists |

A matching path does not by itself prove payload, response shape, authorization, or business semantics are compatible.

## Frontend calls without an exact corresponding Worker route

| Frontend request | Worker currently exposes | Required decision |
|---|---|---|
| `/api/v1/dashboard` | `/api/dashboard/stats` | Align route and dashboard response contract |
| `/api/v1/reports/summary` | `/api/reports/revenue`, `customers`, `subscriptions` | Implement summary aggregation or update frontend |
| `/api/v1/tickets` | `/api/complaints` | Align support/complaint route and payload contract |
| `/api/v1/operations/payment-promises` | No corresponding Worker route found | Decide whether payment promises are in hosted SaaS scope; implement if required |
| `/api/v1/financial/aging` | No corresponding Worker route found | Implement hosted aging report if required |
| `/api/v1/routers` | `/api/network/devices` | Align router inventory route and response contract |
| `/api/v1/acs/connections` | No corresponding Worker route found | Define hosted ACS connection model or explicitly mark local-only |
| `/api/v1/tr069/devices` | No corresponding Worker route found | Define hosted TR-069 device route or explicitly mark local-only |
| `/api/v1/tr069/audit-logs` | No corresponding Worker route found | Define hosted TR-069 audit route or explicitly mark local-only |

## Recommended implementation order

1. Agree on one canonical hosted route/response contract; do not blindly alias paths where payloads or semantics differ.
2. Fix dashboard, reports, support tickets and router inventory alignment.
3. Decide hosted scope for payment promises and financial aging; add tenant-scoped D1 persistence and authorization if retained.
4. Decide whether ACS/TR-069 is hosted in this milestone or remains a separately operated integration.
5. Add API contract documentation beside each route and frontend caller.

## Safety

- Do not deploy Worker or Pages as part of this audit.
- Do not modify production/staging D1, customer records, secrets, or network devices.
- Do not treat local SQLite route availability as proof of hosted Worker availability.


## Implementation update — 2026-11-17

The following hosted implementation work has now been committed on `work/core-feature-completion`:

- Dashboard uses the Worker stats endpoint; the Worker summary endpoint now returns revenue, outstanding receivables, monthly revenue and invoice counts.
- Frontend ticket paths are accepted through the Worker complaints route; ticket rows now include a customer display name and hosted PATCH updates are normalized to PUT.
- Hosted network inventory uses the D1 `network_devices` table. The hosted UI deliberately exposes inventory CRUD only; it does not claim live RouterOS control or store router passwords.
- Hosted payment promise CRUD and overdue aging endpoints have been added, backed by an additive `payment_promises` D1 table migration and organization-scoped queries.
- Hosted invoice creation/payment payloads, package/subscription payloads, and customer/staff form fields receive a compatibility normalization layer.
- Subscription package changes and renewal are now supported by the hosted Worker routes.
- Customer profile response compatibility and list-field aliases were added for the existing Pages UI.

### Still intentionally outside hosted scope

- ACS connection secrets, GenieACS synchronization, TR-069 device actions and TR-069 audit endpoints are not implemented in the hosted Worker. The hosted UI now says so rather than presenting non-functional controls. The existing local Node/SQLite GenieACS adapter remains a separate runtime.
- Live MikroTik commands are not exposed by the hosted Worker; hosted network device management is inventory only.
- Local SQLite and hosted D1 remain independent. No automatic replication or sync has been added.

### Safety and verification boundary

These changes are source changes on the feature branch only. They have not been deployed to Pages or the production Worker, and no production/staging D1 records or secrets have been changed. GitHub Actions source/backend checks are being used for code feedback; live production endpoint smoke failures must be investigated separately and are not represented as passed.
