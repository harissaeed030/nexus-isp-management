# NEXUS Cloudflare Workers

## D1 API Worker (staging)

The complete D1 API implementation is in `src/d1-api-worker.js`. The staging Worker now mirrors the currently deployed production API source; it is kept separate from the health and SQLite-sync Workers.

The configuration `wrangler.api.toml` targets the existing **staging** Worker (`nexus-saas-api-staging`) and staging D1 database (`nexus-saas-staging-db`). The production Worker and production D1 database remain separate.

### API areas

- Organization registration and owner authentication
- JWT sessions, password hashing, login throttling and logout/token-version invalidation
- Tenant-scoped users and staff permissions
- Customers and customer portal accounts
- Packages and subscriptions
- Invoices, monthly billing generation, payments and refunds
- Support complaints/tickets, ticket messages and notifications
- Audit log and reports
- PPPoE accounts and network inventory
- OLT/ONU inventory, alarms, service mapping and adapter capability reporting
- Customer portal login, profile, dashboard, invoice/payment history, subscriptions and tickets

Hardware integrations remain capability-limited: inventory CRUD does not prove a live MikroTik, HSGQ OLT, ONU or ACS connection. Keep device credentials server-side.

### Required configuration

The staging Worker already has these Cloudflare bindings configured (values are not stored in Git):

- Required: `JWT_SECRET` (long random secret)
- Required for browser use: `ALLOWED_ORIGINS` (exact comma-separated trusted origins)
- Optional/feature-specific: `TURNSTILE_SECRET_KEY`

The D1 binding is `DB` and is defined in `wrangler.api.toml`.

### Schema and migrations

- `schema-production-v6.sql` is a baseline snapshot for a **new empty database only**.
- Migrations `0006`–`0009` are additive integrity/index migrations aligned with the released schema.
- Migrations `0010` and `0011` add PPPoE metadata and SQLite sync inbox tables.
- Never apply the baseline snapshot to an existing D1 database.
- Confirm the target database migration state and take a D1 export before applying any migration.
- The API Worker has an idempotent runtime schema bootstrap for additive application tables/columns. Review the code and staging database before first request/deployment; a new Worker version is not a substitute for migration verification.

### Staging deployment

From this `worker/` directory, after confirming Cloudflare account and D1 binding:

```sh
npx wrangler deploy --config wrangler.api.toml
```

This deploys the staging Worker only. It does not deploy the production Worker. Existing `JWT_SECRET`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY` and D1 bindings were preserved during the API deployment. Do not change `wrangler.api.toml` to production or deploy over `nexus-saas-api` without a separate reviewed release, current backup, migration preflight, staging smoke tests and explicit approval.

### Existing separate Workers

- `wrangler.toml`: health-check Worker only.
- `wrangler.sync.toml`: SQLite-to-D1 sync Worker (`/sync/push`); not the public API.
- `wrangler.api.toml`: full D1 API staging Worker, isolated from production by Worker name and staging D1 binding.

## SQLite-to-D1 sync

The isolated sync Worker runs `src/sync-worker.js` as `nexus-sqlite-sync`.

- `GET /health` checks the sync Worker and D1 binding.
- `POST /sync/push` accepts authenticated batches from the local SQLite outbox.
- Configure `SYNC_PUSH_TOKEN` as a Worker secret and use the same value as `D1_SYNC_WORKER_TOKEN` in local backend `.env`.
- Sync currently covers customers, packages, subscriptions, invoices and payments in one direction (SQLite to D1). It does not synchronize users, passwords, sessions, PPPoE credentials, router/ACS secrets, support tickets, staff, notifications or network inventory.
- Verify the tenant-to-organization mapping, PKR currency and private backup before running `npm run sync:d1` from `backend/`.

See [SQLite-to-D1 sync implementation](../docs/SQLITE-TO-D1-SYNC-IMPLEMENTATION.md).
