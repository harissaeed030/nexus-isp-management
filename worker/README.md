# Nexus Cloudflare Worker — repository scope

The `worker/` directory on this development branch is a minimal Cloudflare Worker/D1 health-check foundation. Its current source exposes `GET /api/health` and `OPTIONS`; it does **not** implement the full local Node.js API contract or the full ISP-management module set.

The maintained local development runtime is `backend/` (Node.js + SQLite). Its setup and test instructions are in [Backend setup](../docs/BACKEND-SETUP.md).

## Health endpoint

Configure the D1 binding in `wrangler.toml` for a disposable development database, then deploy only when the target Worker and database have been explicitly reviewed. The health route is:

```
GET /api/health
```

It reports Worker status and whether the configured D1 binding can execute a simple query. It is not an authentication or business API readiness check.

## Important production boundary

The repository's `main` branch contains the separately released Cloudflare customer-portal Worker path. The production release record is documented in the [Production release 2026-11-15 on main](https://github.com/harissaeed030/nexus-isp-management/blob/main/docs/PRODUCTION-RELEASE-2026-11-15.md). Do not deploy this branch's minimal `worker/` directory over the production Worker: it is not a replacement for the released Worker source.

The SQLite migrations under `backend/migrations/` are not D1 migrations. Never apply them to a Cloudflare D1 database. Use additive D1 migrations and the documented release procedure for the Cloudflare runtime.

## Security

- Keep D1 bindings and Worker secrets in Cloudflare configuration, never in source control.
- Restrict CORS to exact approved origins.
- Do not add real customer records to this health-only Worker foundation.
- Do not expose router, OLT or ACS credentials to browser JavaScript.
- Verify the deployment target, Worker source, D1 binding and current production backup before any production change.

## SQLite-to-D1 sync Worker

The isolated sync deployment is configured by `wrangler.sync.toml` and runs
`src/sync-worker.js` as Worker `nexus-sqlite-sync`. It is separate from the
health-check Worker configured by `wrangler.toml` and must not replace the
production NEXUS API Worker.

- `GET /health` checks that the sync Worker and D1 binding are present.
- `POST /sync/push` accepts authenticated batches from the local SQLite outbox.
- `POST /init` is **not** an endpoint on this Worker. D1 migration
  `cloudflare/d1/migrations/0011_sqlite_sync_inbox.sql` must be applied through
  the reviewed D1 migration process before sync is enabled.
- Configure `SYNC_PUSH_TOKEN` as a Worker secret and use the same value as
  `D1_SYNC_WORKER_TOKEN` in the local backend `.env`. Never put it in browser
  code or commit it.
- The sync currently covers customers, packages, subscriptions, invoices and
  payments in one direction (SQLite to D1). It does not synchronize users,
  passwords, sessions, PPPoE credentials, router/ACS secrets, support tickets,
  staff, notifications or network inventory.
- A source tenant is mapped to a D1 organization only under the documented
  PKR/organization safeguards. Existing customer-code conflicts require manual
  reconciliation; the Worker must not silently merge records.
- Sync is not active until the Worker secret and local environment values are
  configured. A deployed Worker alone does not prove a successful data sync.

Run `npm run sync:d1` from `backend/` only after verifying the local SQLite
tenant, D1 organization mapping, PKR currency and a private backup. See
[SQLite-to-D1 sync implementation](../docs/SQLITE-TO-D1-SYNC-IMPLEMENTATION.md).
