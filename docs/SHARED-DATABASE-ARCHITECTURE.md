# Shared SQLite and Cloudflare D1 database architecture

**Contract version:** 1  
**Status:** shared adapter and tenant repository implemented; legacy route migration and full schema parity remain staged work.

## Components

- `shared/database/adapters.js` defines one asynchronous adapter contract:
  `first`, `all`, `run`, `batch`, and `close`.
- `createSqliteAdapter` wraps the existing Node `DatabaseSync` connection.
- `createD1Adapter` wraps a Cloudflare D1 binding. D1 batches use the platform's atomic `batch()` operation; the adapter does not pretend D1 supports arbitrary interactive transactions.
- `shared/database/schema.js` maps the five currently synchronized logical entities to their actual SQLite and D1 table/column names.
- `shared/database/repository.js` provides tenant-scoped get/list/create/update/archive operations and bound SQL values.
- `backend/src/config/database.js` exports `repository` for the local runtime while retaining `db` so existing synchronous routes continue working during incremental migration.

## Usage

Local SQLite:

```js
import { db, repository } from "./config/database.js";
const customer = await repository.get("customers", tenantId, customerId);
```

Cloudflare Worker:

```js
import { createD1Adapter, createTenantRepository, schemaFor } from "../../shared/database/index.js";
const repository = createTenantRepository(createD1Adapter(env.DB), schemaFor("d1"));
const customer = await repository.get("customers", organizationId, customerId);
```

The D1 example uses `organization_id`; the SQLite example uses `tenant_id`. Always take the tenant/organization identifier from the authenticated server-side principal, never from an untrusted record body.

## Guarantees

- Same async adapter API and positional `?` placeholders across both engines.
- Bound values; validated allow-listed table/column identifiers.
- Tenant scope included in every repository read and mutation.
- Bounded pagination and validated sort columns.
- Optional optimistic update guard via `expectedUpdatedAt`; a zero-row update is reported as a conflict.
- Safe archive operations; D1 packages map to `is_active=0` rather than writing an incompatible status string.
- SQLite batch runs inside `BEGIN IMMEDIATE` / `COMMIT` and rolls back on failure.
- D1 batch delegates to D1's atomic batch API.
- No automatic schema snapshot, destructive migration, or silent cross-database overwrite.

## Physical schema differences

The databases are not byte-for-byte identical. The repository metadata records the existing differences, including:

| Concept | SQLite | D1 |
|---|---|---|
| Tenant root | `tenants` | `organizations` |
| Tenant FK | `tenant_id` | `organization_id` |
| Customer name | `full_name` | `first_name` + `last_name` |
| Package speeds | `speed_down_mbps`, `speed_up_mbps` | `speed_mbps`, `speed_down`, `speed_up` |
| Package price | `monthly_price_pkr` | `price` |
| Invoice amount | `amount_pkr` | `amount`, `tax`, `total` |
| Payment method | `method` | `payment_method` |

The repository is a tenant-scoped persistence layer, not an implicit currency/name/status converter. Domain mappers must explicitly normalize values before persistence. Never copy rows between schemas by assuming similarly named columns have identical semantics.

## Current integration boundary

The existing Express application still contains direct synchronous `db.prepare()` calls in its legacy route handlers. Those routes have not all been converted to the asynchronous repository yet. The released production Worker on `main` is also maintained separately; this branch's health/sync Workers are not a replacement for it. Adopt the shared repository incrementally, module by module, and retain compatibility tests until each route has migrated.

The current shared entity metadata covers customers, packages, subscriptions, invoices and payments—the five entities in the existing SQLite-to-D1 outbox protocol. Users, sessions, staff permissions, tickets, refunds, notifications, PPPoE secrets, routers, OLT/ONU and ACS records need separate reviewed mappings before they can use this cross-runtime contract. Credentials and session secrets must not be synchronized.

## Verification

From `backend/`:

```sh
npm install
npm run check
node --test scripts/shared-database.test.js
```

The contract tests cover tenant isolation, optimistic conflict detection, invalid fields, bounded pagination, SQLite rollback, D1 parameter binding, normalized results, and both dialect metadata maps.

## Migration policy

- Keep SQLite migrations in `backend/migrations/`.
- Keep D1 migrations in `cloudflare/d1/migrations/` on the production source branch.
- Never execute SQLite migration files against D1 or D1 migrations against SQLite.
- Existing records are preserved; no migration in this change drops or rewrites business tables.
- Schema changes must be additive, versioned, tested against both engines, and reconciled before sync activation.
- Financial ledger rows are immutable operations; do not use last-write-wins for invoices or payments.
