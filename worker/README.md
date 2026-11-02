# Nexus API — Phase 1

This is the initial Cloudflare Worker API foundation for Nexus.

## Current scope
- `GET /api/health` service and D1 connectivity check.
- D1 schema for tenants, users, customers, packages, subscriptions, invoices, payments, support tickets and audit logs.
- No customer CRUD or login endpoints are enabled yet.

## Cloudflare setup (Android browser)
1. In Cloudflare Dashboard, open Workers & Pages and create a D1 database named `nexus-db`.
2. Open the database Console and execute the complete SQL in `worker/schema.sql`.
3. Open the database Settings and copy its Database ID.
4. Replace `REPLACE_WITH_D1_DATABASE_ID` in `worker/wrangler.toml` with that ID.
5. Connect this GitHub repository to a new Worker named `nexus-api`, with the Worker root directory set to `worker`.
6. Deploy, then open `https://YOUR-WORKER-DOMAIN/api/health`.

## Security before production
- Do not add real customer data until authentication and authorization are implemented.
- Never expose router, OLT, ACS or database credentials in browser JavaScript.
- Configure exact frontend origins in the Worker variable `ALLOWED_ORIGINS`.
- Every tenant-owned query must be scoped to the authenticated tenant on the server.
- The health route is public and intentionally reveals only service/database status.

## Important
This is a foundation, not a production-ready ISP backend. Login, password hashing, sessions, tenant authorization, CRUD validation, rate limiting and audit events must be completed and tested before live use.
