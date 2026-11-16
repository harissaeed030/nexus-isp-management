# SQLite → Cloudflare D1 sync implementation

## Implemented on `build/nexus-isp-core`

- SQLite migration `012_sqlite_d1_sync_outbox.sql` creates a durable outbox and records inserts, updates, deletes, and a one-time initial snapshot for customers, packages, subscriptions, invoices, and payments.
- `GET /api/v1/sync/export` exposes bounded (1–100 rows), tenant-scoped snapshots behind a dedicated bearer token. It exports only approved business fields; it never exports user credentials, sessions, PPPoE credentials, router/ACS secrets, or API keys.
- `backend/scripts/sync-to-d1.js` reads the authenticated local export API, posts batches to the dedicated Worker, and advances its SQLite cursor only after a successful Worker acknowledgement.
- `worker/src/sync-worker.js` accepts authenticated batches, requires an explicit local-tenant → D1-organization mapping, validates parent/tenant relationships, maps the five business entities into D1's native columns, and records each operation in an idempotency ledger.
- D1 migration `0011_sqlite_sync_inbox.sql` creates only the tenant mapping and idempotency tables. It does not change existing business records.
- `worker/wrangler.sync.toml` defines an isolated Worker named `nexus-sqlite-sync`; it does not replace the existing NEXUS production API Worker.

## Important financial safeguards

SQLite stores package, invoice, and payment amounts in PKR. The D1 Vancom organization currency was changed from `USD` to `PKR` after verifying that it had no packages, subscriptions, invoices, or payments. The Worker checks this currency before accepting records.

The D1 database currently has two existing customer rows and no package, subscription, invoice, or payment rows. On the first authenticated sync, the Worker creates the source-tenant mapping automatically only if D1 contains exactly one organization and its currency is PKR. Existing customer rows are protected by ID and customer-code conflict checks.

## Configuration

Set these private values in `backend/.env` (never commit real values):

- `SYNC_TENANT_ID`: optional when the local SQLite database has exactly one tenant (the API detects it); otherwise set the local tenant ID returned by `GET /api/v1/tenant`.
- `SYNC_EXPORT_TOKEN`: a strong random secret used only by the local export endpoint.
- `D1_SYNC_WORKER_URL`: the deployed isolated Worker URL ending in `/sync/push`.
- `D1_SYNC_WORKER_TOKEN`: the same strong random secret configured as the Worker `SYNC_PUSH_TOKEN`.

Run the backend, then run `npm run sync:d1` from `backend/`. The command is resumable; its last acknowledged cursor is stored in SQLite as `sync_state.d1_cursor`.

## Activation status

Code is committed to the development branch. D1 migration 0011 has been applied to production, the isolated `nexus-sqlite-sync` Worker is deployed with its D1 binding, and the Vancom organization currency is now PKR. The Worker secret `SYNC_PUSH_TOKEN` is not configured yet. No business records have been synced; live sync becomes active after the user adds that secret and the two local `.env` values, starts the Termux API, and runs `npm run sync:d1`.
