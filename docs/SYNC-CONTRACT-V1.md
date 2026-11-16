# NEXUS SQLite-to-D1 contract v1

Status: **contract and deterministic mapping implemented on an isolated feature branch; production sync is NOT enabled**.

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

## Not yet activated

This branch does not add a production Worker route, D1 migration, local transactional outbox, retry scheduler, or authenticated transport. The tests are deterministic contract/mapping tests with an in-memory idempotency ledger, not a live cross-database integration test. Before activation, add those components, run against synthetic staging data, add a reconciliation report, and require an explicit production rollout approval. Do not merge or deploy this branch as a completed sync service.
