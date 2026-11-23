# NEXUS SQLite-to-D1 contract v1

Status (2026-11-23): **contract/mapping tests and local SQLite transactional outbox/retry queue exist in the repository; end-to-end SQLite-to-D1 transport is NOT implemented or enabled**.

## Authority and direction

Cloudflare D1 remains authoritative. The only permitted future direction is local SQLite outbox -> authenticated production Worker -> D1. There is no reverse overwrite, bidirectional last-write-wins, or direct database file transfer.

## V1 entities

Customers, packages, subscriptions, invoices and payments. Staff identities, password hashes, sessions, router/PPPoE/OLT/ONU/ACS credentials and secrets are excluded.

## Identity and mapping

The caller must resolve a provisioned local tenant -> production organization mapping. The mapping is supplied separately as `organizationId`; it is never inferred from a client payload. The Worker must derive the actual organization from the verified JWT and compare it with the provisioned mapping. Parent/child relations must be checked against that organization on the server.

The pure mapper is `shared/sync-contract/v1.js`. It translates local `tenant_id` into the authenticated `organization_id`, splits customer full names, maps independent package speeds and integer PKR amounts, and keeps invoice/payment amounts as safe integers. Payment records are append-only events; no update or last-write-wins payment behavior is defined.

## Operation envelope

Each operation carries contractVersion, globally unique operationId, tenantId, entity, entityId, operation and a validated payload. Unknown entities, unsupported versions, malformed records and sensitive field names are rejected.

## Test coverage

Run `node --test shared/sync-contract/v1.test.js`. Tests cover field mapping, tenant identity separation, financial integer safety, secret rejection, relationship fields, duplicate replay and idempotency-key payload mismatch.

## Implemented locally (not a production sync service)

- `backend/migrations/011_sqlite_sync_outbox.sql` creates the local SQLite outbox and allowlisted triggers for customers, packages, subscriptions, invoices and payments.
- `backend/src/services/sync-outbox.js` claims leased batches, validates envelopes through the shared contract, retries with bounded exponential backoff, quarantines repeated/permanent failures, and supports explicit requeue.
- `backend/scripts/sync-outbox.test.js` covers the local outbox lifecycle. This queue is local to the Node/SQLite runtime; it does not transmit records to Cloudflare.

## Remaining activation blockers

1. No authenticated production/staging Worker endpoint accepts and validates sync operation batches.
2. No D1-side idempotency ledger enforces operation ID uniqueness and rejects reuse of an idempotency key with a different payload.
3. No tested organization/tenant provisioning map exists between local SQLite tenants and hosted D1 organizations. The server must derive organization identity from the verified JWT, not trust a client-supplied tenant/organization ID.
4. The local SQLite schema and hosted D1 schema are different domain models. The D1 migration histories were rechecked on 2026-11-19 and are not aligned (production records 1–10, 12, 13, 100, 101; staging records 1–21, 100). The users table constraints/defaults also differ. Do not add sync writes or apply migrations to either live database until a disposable restore rehearsal establishes a forward-only schema/contract plan.
5. No Android/browser IndexedDB mutation queue, reconnect sender, or end-to-end staging reconciliation test is verified.

## Required rollout gates

- Reconcile and version the SQLite-to-D1 field mappings against the actual current D1 schema, including parent/child organization checks and payment append-only semantics.
- Add an authenticated Worker batch route and D1 idempotency ledger using additive migrations only after the migration-ledger discrepancy is resolved in a disposable D1 restore rehearsal.
- Add a browser-side durable queue only for explicitly supported operations; never report a queued payment as a confirmed payment. Show pending, synced and failed states.
- Run synthetic-tenant staging E2E tests for retries, duplicate replay, payload mismatch, cross-tenant rejection, partial batch failure and reconciliation counts.
- Require explicit production rollout approval. Do not merge or deploy this contract as a completed sync service.
