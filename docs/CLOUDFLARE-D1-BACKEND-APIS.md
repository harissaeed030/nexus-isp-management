# Cloudflare D1 backend API implementation

## Scope

This branch now contains a dedicated D1 API Worker candidate at `worker/src/d1-api-worker.js`, copied from the repository's released Cloudflare API implementation. It is separate from the health-only Worker and the SQLite-to-D1 sync Worker.

The candidate configuration is `worker/wrangler.api.toml`. It targets the staging D1 database and uses a separate Worker name. No Worker was deployed and no D1 data was changed by these GitHub commits.

## API capabilities

The Worker implements the existing NEXUS Cloudflare API contract, including:

- Organization registration, owner login, JWT authentication, logout and current-user profile.
- Password hashing/verification, login throttling, token-version invalidation and role/permission checks.
- Tenant-scoped customer, package and subscription CRUD.
- Invoice creation/listing, monthly billing generation, payment collection/history and refunds.
- Complaints/support tickets, staff management and staff permission overrides.
- Dashboard statistics, reports, audit records, notifications and exports.
- PPPoE accounts, network-device inventory, OLT/ONU inventory and connection capability endpoints.
- Customer portal authentication and tenant-scoped profile, dashboard, subscriptions, invoices, payments and tickets.

All API requests that require a user session use a signed JWT and resolve the organization/user identity from the verified token; clients must not submit an organization ID as an authority for data access. The Worker applies role permissions and organization-scoped D1 queries.

## Deployment configuration

`worker/wrangler.api.toml` binds `DB` to `nexus-saas-staging-db` (not the production D1 database) and publishes under `nexus-saas-api-d1-candidate`.

Set secrets in Cloudflare Worker settings, not Git:

- `JWT_SECRET` — required, use a high-entropy random value.
- `ALLOWED_ORIGINS` — exact trusted frontend origins, comma-separated.
- `TURNSTILE_SECRET_KEY` — only when Turnstile verification is enabled.

Deployment command (from `worker/`):

```sh
npx wrangler deploy --config wrangler.api.toml
```

Do not deploy to production as part of this task. Before staging deployment, verify the Cloudflare account, target database ID, current D1 export, migration state, secrets and CORS origins.

## D1 schema notes

- `worker/schema-production-v6.sql` is a canonical baseline for a new empty D1 database only.
- `cloudflare/d1/migrations/0006`–`0009` restore the released tenant-integrity and user-email-index migration chain in this branch.
- `0010` adds PPPoE connection metadata; `0011` adds the SQLite sync mapping/operation registry.
- Existing staging/production D1 databases must be upgraded using their actual migration state. Never apply a baseline schema snapshot over a populated database.
- The Worker also contains an idempotent additive runtime schema bootstrap. Review it against the target database before first API request; don't assume deploying code alone proves schema readiness.

## Verification status

The branch adds a Node syntax check for the D1 API Worker and a static API contract test. These checks do not replace a deployed staging smoke test, real authentication flow, tenant-isolation E2E, billing/payment scenario, or hardware integration test.

## Explicit non-goals

- No deployment to production or staging was performed.
- No live customer data was imported, changed or deleted.
- A configured router/OLT/ONU record does not prove a live hardware session. MikroTik, HSGQ and TR-069 integrations still require their respective reachable equipment, vendor-supported interfaces and credentials.
- SQLite-to-D1 sync remains a separate one-way worker and does not automatically synchronize users, staff, sessions, tickets, network inventory or secrets.
