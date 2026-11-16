# SQLite → Cloudflare D1 sync implementation

## Implemented on `build/nexus-isp-core`

- SQLite migration `012_sqlite_d1_sync_outbox.sql` creates a durable outbox and records inserts, updates, deletes, and a one-time initial snapshot for customers, packages, subscriptions, invoices, and payments.
- `GET /api/v1/sync/export` exposes bounded (1–100 rows), tenant-scoped snapshots behind a dedicated bearer token. It exports only approved business fields; it never exports user credentials, sessions, PPPoE credentials, router/ACS secrets, or API keys.
- `backend/scripts/sync-to-d1.js` reads the authenticated local export API, posts batches to the dedicated Worker, and advances its SQLite cursor only after a successful Worker acknowledgement.
- `worker/src/sync-worker.js` accepts authenticated batches, requires an explicit local-tenant → D1-organization mapping, validates parent/tenant relationships, maps the five business entities into D1's native columns, and records each operation in an idempotency ledger.
- D1 migration `0011_sqlite_sync_inbox.sql` creates only the tenant mapping and idempotency tables. It does not change existing business records.
- `worker/wrangler.sync.toml` defines an isolated Worker named `nexus-sqlite-sync`; it does not replace the existing NEXUS production API Worker.

## Important financial safeguards

SQLite stores package, invoice, and payment amounts in PKR. The current D1 Vancom organization was inspected and its currency is presently `USD`. The sync Worker therefore refuses to import any financial records until the organization currency is explicitly corrected to `PKR`. Do not remove this guard or silently treat PKR amounts as USD.

The D1 database currently has two customer rows and no package, subscription, invoice, or payment rows. The sync mapping remains intentionally unconfigured until the local SQLite tenant ID is verified and reconciled with the existing Vancom organization. Existing customer rows must not be duplicated or overwritten without an ID/code reconciliation.

## Configuration

Set these private values in `backend/.env` (never commit real values):

- `SYNC_TENANT_ID`: optional when the local SQLite database has exactly one tenant (the API detects it); otherwise set the local tenant ID returned by `GET /api/v1/tenant`.
- `SYNC_EXPORT_TOKEN`: a strong random secret used only by the local export endpoint.
- `D1_SYNC_WORKER_URL`: the deployed isolated Worker URL ending in `/sync/push`.
- `D1_SYNC_WORKER_TOKEN`: the same strong random secret configured as the Worker `SYNC_PUSH_TOKEN`.

Run the backend, then run `npm run sync:d1` from `backend/`. The command is resumable; its last acknowledged cursor is stored in SQLite as `sync_state.d1_cursor`.

## Activation status

Code is committed to the development branch. D1 migration 0011 has been applied to the production `nexus-saas-db`, and the isolated `nexus-sqlite-sync` Worker has been deployed with the correct D1 binding and observability. The Worker secret `SYNC_PUSH_TOKEN` is not yet configured, the tenant mapping is empty, and the existing Vancom organization currency is still USD. The Worker deliberately rejects PKR imports until the currency is confirmed and corrected. No business records have been synced; live sync is not active.
