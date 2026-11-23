# Hosted D1 and frontend API parity audit

Audit target: `assets/js/app.js` versus `worker/src/index.js` on `claude/complete-on-main`.
Status: source review only; no Worker deployment or D1 writes.

## Implemented / compatible paths observed

| Frontend request | Worker route | Assessment |
|---|---|---|
| `/api/v1/auth/me` | `/api/auth/me` | Available; confirm response envelope in frontend |
| `/api/v1/customers` | `/api/customers` | Route exists |
| `/api/v1/packages` | `/api/packages` | Route exists |
| `/api/v1/subscriptions` | `/api/subscriptions` | Route exists |
| `/api/v1/invoices` | `/api/invoices` | Route exists |
| `/api/v1/payments` | `/api/payments` | Route exists |
| `/api/v1/billing/generate` | `/api/billing/generate` | Route exists |
| `/api/v1/staff` | `/api/staff` | Route exists |
| `/api/v1/audit-logs` | `/api/audit-logs` | Route exists |
| `/api/v1/tenant` | `/api/tenant` | Added in this branch; owner-only; D1 migration adds `organizations.brand_color` |

## Frontend paths with no matching Worker route

| Frontend request | Closest Worker route | Required work |
|---|---|---|
| `/api/v1/dashboard` | `/api/dashboard/stats` | Confirm and adapt response envelope/field names |
| `/api/v1/reports/summary` | `/api/reports/revenue`, `customers`, `subscriptions` | Define summary response and aggregate existing reports |
| `/api/v1/financial/aging` | None | Implement tenant-scoped invoice aging query and response contract |
| `/api/v1/operations/payment-promises` | None | Add schema, migration, tenant-scoped CRUD, audit and validation |
| `/api/v1/routers` | `/api/network/devices` | Map router UI fields to network-device model; do not alias without shape checks |
| `/api/v1/tickets` | `/api/complaints` | Reconcile support-ticket/complaint schema, assignment and response shapes |
| `/api/v1/tr069/devices` | `/api/onus` (not equivalent) | Implement ACS/ONU inventory integration; no blind alias |
| `/api/v1/tr069/audit-logs` | `/api/audit-logs` (not equivalent) | Define TR-069 event model and access boundaries |
| `/api/v1/acs/connections` | None | Add encrypted credential storage, secret handling and connection test flow |

## Release blockers

1. The hosted D1 Worker and the frontend currently expose different contracts for dashboard, tickets, routers, financial aging, payment promises and TR-069/ACS.
2. Do not merge or deploy the frontend as a complete hosted-D1 application until each path has an explicit response schema and tenant-isolation tests.
3. Do not store ACS usernames/passwords as plaintext. Use encrypted secrets or a dedicated secret binding, with redaction in every API response and audit log.
4. Payment promises and invoice aging must be computed using organization-scoped queries; never trust a client-supplied organization ID.
5. Keep the D1 customer_limit unset until plan entitlements and enforcement are implemented and tested on staging.

## Safe verification performed

- The current PR CI includes Node 22/26 backend checks, backend verification, tenant-isolation/customer-portal E2E, live smoke checks, SQLite migration reconciliation, SQLite-D1 sync contract and database hardening.
- The live smoke workflow now also verifies that unauthenticated `GET /api/tenant` returns HTTP 401 on production and staging.
- The hosted Worker has not been deployed and no D1 migration has been executed by this work.
