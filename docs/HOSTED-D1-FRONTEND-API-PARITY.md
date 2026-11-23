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
| `/api/v1/dashboard` | `/api/dashboard` | Added compatibility envelope `{stats}` backed by tenant-scoped dashboard stats |
| `/api/v1/reports/summary` | `/api/reports/summary` | Added `{data:{monthlyRevenue,outstandingPkr}}` adapter backed by tenant-scoped dashboard queries |
| `/api/v1/financial/aging` | None | Implement tenant-scoped invoice aging query and response contract |
| `/api/v1/operations/payment-promises` | None | Add schema, migration, tenant-scoped CRUD, audit and validation |
| `/api/v1/routers` | `/api/network/devices` | Map router UI fields to network-device model; do not alias without shape checks |
| `/api/v1/tickets` | `/api/tickets` (compatibility alias) | Added tenant-scoped list/create/update routes; response now includes customer and assignee display names plus a stable ID-derived ticket label. Frontend camelCase create/assignment fields are normalized; UI priority `normal` maps to the hosted D1 enum `medium`. The displayed `TKT-` label is a stable ID-derived reference, not a sequential counter. Ticket conversation GET/POST endpoints are now available under `/api/tickets/:id/messages`, with tenant-scoped ticket lookup, staff author attribution, validation and audit logging; assignment history remains future work |
| `/api/v1/tr069/devices` | `/api/onus` (not equivalent) | Implement ACS/ONU inventory integration; no blind alias |
| `/api/v1/tr069/audit-logs` | `/api/audit-logs` (not equivalent) | Define TR-069 event model and access boundaries |
| `/api/v1/acs/connections` | None | Add encrypted credential storage, secret handling and connection test flow |

## Release blockers

1. The hosted D1 Worker and the frontend currently expose different contracts for tickets, routers, financial aging, payment promises and TR-069/ACS. Dashboard and summary compatibility adapters have now been added to the Worker source.
2. Ticket list/create/update and conversation read/reply compatibility has been added in the Worker source. Do not merge or deploy the frontend as a complete hosted-D1 application until remaining routes have explicit response schemas and tenant-isolation tests.
3. Do not store ACS usernames/passwords as plaintext. Use encrypted secrets or a dedicated secret binding, with redaction in every API response and audit log.
4. Payment promises and invoice aging must be computed using organization-scoped queries; never trust a client-supplied organization ID.
5. Keep the D1 customer_limit unset until plan entitlements and enforcement are implemented and tested on staging.

## Safe verification performed

- The current PR CI includes Node 22/26 backend checks, backend verification, tenant-isolation/customer-portal E2E, live smoke checks, SQLite migration reconciliation, SQLite-D1 sync contract and database hardening.
- The live smoke workflow now also verifies that unauthenticated `GET /api/tenant` returns HTTP 401 on production and staging.
- The hosted Worker has not been deployed and no D1 migration has been executed by this work.
