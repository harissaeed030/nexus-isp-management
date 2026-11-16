# SQLite and Cloudflare D1 compatibility status

## Runtime boundary

NEXUS currently has two different runtimes:

- `backend/`: Node.js + `node:sqlite`, using `tenants` and `tenant_id`.
- Cloudflare production Worker/D1: separate Worker code and a D1 schema using `organizations` and `organization_id`.

They are **not yet one interchangeable repository implementation**. Do not point the Node SQLite backend at D1 or deploy the development health-check Worker over the production Worker.

## Core field mapping

| Domain | Local SQLite | Cloudflare D1 | Compatibility note |
|---|---|---|---|
| ISP workspace | `tenants.id` | `organizations.id` | `tenant_id` maps to `organization_id`. |
| Customer | `customers.full_name` | `customers.first_name` + `last_name` | Normalize name on import/export; D1 also has different address fields. |
| Package | `speed_down_mbps`, `speed_up_mbps`, `monthly_price_pkr` | D1 package columns | Convert units and currency fields explicitly; do not copy rows blindly. |
| Subscription | `started_at`, `expires_at`, `renewed_at` | `start_date`, `end_date`, `auto_renew` | `expires_at` maps to `end_date`; renewal timestamp needs a separate mapping. |
| Invoice | `amount_pkr`, `due_date`, `status` | `amount`, `tax`, `total`, `due_date`, `status` | Preserve total and payment state; local and D1 status vocabularies differ. |
| Payment | `amount_pkr`, `method`, `reference`, `received_at` | `amount`, `payment_method`, `transaction_ref`, `paid_at` | Convert amount and method fields; never infer missing references. |
| PPPoE | `pppoe_accounts.tenant_id`, `password_ciphertext` | `pppoe_accounts.organization_id`, `password` | Credentials are not portable as plaintext. Only migrate credentials through a separately reviewed encryption/key-rotation process. |

## PPPoE changes in this branch

SQLite migration 011 creates a dedicated `pppoe_accounts` table, migrates legacy usernames/router links, enforces tenant ownership with triggers, and adds router connection metadata. The MikroTik customer mapping and sync endpoints now read/write this normalized table. Passwords supplied to the mapping endpoint are encrypted with the existing AES-256-GCM router credential key; the API never returns the ciphertext.

Cloudflare D1 migration 0010 adds router, MAC and connection timestamps to the existing D1 PPPoE table. It does not copy or expose credentials.

## Sync Worker behavior

The `d1-sync-worker` stores received records in generic `sync_records` JSON snapshots and tracks batches/failures. It does **not** apply those JSON records to the live D1 business tables. It is a sync ledger/mirror, not a shared SQL repository.

The Worker now has a D1 binding to the NEXUS SaaS D1 database and an `API_KEY` secret binding. The Worker source endpoint currently named `nexus-sqlite-export` is not a real SQLite exporter: its code queries D1 using `organization_id`. Do not configure it as `SYNC_SOURCE_URL` for the Android SQLite database.

## Remaining requirement for true shared storage

To finish true SQLite ↔ D1 parity, implement and test one canonical repository contract with two adapters, or implement a validated change-feed that maps every domain table and status vocabulary into the live D1 tables. The current generic JSON sync path is not sufficient. A real source URL must be reachable from Cloudflare and must return authenticated, tenant-scoped records from the running SQLite API. No such public SQLite endpoint is configured in this repository today.

## Safe operating rules

- Keep SQLite and D1 migrations separate.
- Keep `ROUTER_CREDENTIAL_KEY`, `API_KEY`, and export credentials in secret bindings/environment variables only.
- Never sync password hashes, PPPoE passwords, router credentials, session tokens, or API keys as generic JSON records.
- Before enabling auto-pull, verify source URL, source token, tenant identifier, and the D1 destination independently.
