# SQLite → Cloudflare D1 synchronization implementation plan

**Decision date:** 2026-11-15  
**Authority:** Cloudflare D1 production database  
**Local role:** SQLite offline workspace  
**Status:** implementation committed; production push Worker deployed; activation pending explicit tenant mapping and local/Worker secret configuration

## Non-negotiable direction

Business writes may flow only from a local SQLite outbox to the authenticated production Worker and then into D1. D1 is authoritative. A stale local snapshot must never overwrite a newer D1 record. No D1-to-SQLite bulk overwrite and no bidirectional last-write-wins merge.

## Scope for the first safe release

The first release should synchronize only the core ISP business records:

1. Customers
2. Packages
3. Subscriptions
4. Invoices
5. Payments

Staff credentials, password hashes, bearer/session tokens, PPPoE secrets, router credentials, OLT/ONU credentials, ACS credentials, and other secrets are explicitly excluded.

## Required protocol

- Every local mutation creates an outbox operation in the same SQLite transaction as the business change.
- Each operation has a globally unique operation ID, tenant mapping, entity type, entity ID, operation type, schema version, payload, creation timestamp, attempt count, and last error.
- The client submits bounded batches to a dedicated authenticated Worker endpoint over HTTPS.
- The Worker validates the JWT organization, maps the local tenant to the authenticated organization using a separately provisioned mapping, validates every relationship belongs to that organization, and rejects unknown fields/types.
- D1 stores processed operation IDs under a unique constraint. Replaying the same operation returns the original result and cannot create duplicate customers, invoices, or payments.
- Acknowledgement is returned only after the D1 transaction/batch is committed. The client marks only acknowledged operations as delivered.
- Transient failures remain queued with bounded exponential backoff. Permanent validation/conflict failures are quarantined and shown to the operator; they are not silently discarded.
- Deletes use explicit tombstones or supported status transitions. Hard deletes are not inferred from missing rows.

## Conflict and financial safety

- Customer/package descriptive fields may use server version checks; conflicting updates return a conflict requiring refresh/review.
- Subscription state transitions must validate the current D1 state and allowed transition.
- Invoices are created once using an idempotency key and unique organization/invoice-number constraints. Issued invoice totals are not silently rewritten by offline edits.
- Payments are immutable ledger events. A duplicate idempotency key returns the original payment; a reused key with a different payload is rejected.
- Refunds, reversals and credit notes are separate audited operations and must preserve existing D1 balance constraints.
- Never resolve invoice/payment conflicts with last-write-wins or by summing duplicate submissions.

## Tenant identity and mapping

Local `tenant_id` and production `organization_id` are different identity domains. A mapping must be explicitly provisioned and verified by an owner/admin before sync is enabled. Never assume the IDs match, derive an organization from a client-supplied payload, or allow the client to choose another organization. Every parent-child relation (subscription/customer/package, invoice/customer, payment/invoice/customer) must be checked server-side.

## Rollout gates

1. Implement a versioned API contract and D1 idempotency ledger through an incremental D1 migration on the production source branch.
2. Implement the SQLite outbox and transaction hooks; keep local queue durable across app restarts.
3. Add contract tests for tenant isolation, malformed payloads, duplicate/replayed operations, partial batches, retry behavior, stale versions, invoice uniqueness, and payment idempotency.
4. Rehearse with synthetic data against a separate staging Worker/D1 database only.
5. Produce a dry-run/reconciliation report (counts, IDs, checksums, rejects) before any import of existing local records.
6. Back up production D1, verify migration state and bindings, then obtain explicit production activation approval.
7. Enable sync for one test tenant first. Monitor rejects and duplicate/idempotency metrics before widening rollout.

## Current limitations

- The durable SQLite outbox, authenticated export endpoint, dedicated D1 push Worker, idempotency ledger, and five-entity mapping are implemented.
- The production push Worker is deployed as `nexus-sqlite-sync` with the production D1 binding. Its `SYNC_PUSH_TOKEN` secret still must be configured before requests can authenticate.
- The Worker requires a pre-provisioned `sync_tenant_mappings` row. It no longer auto-maps a local tenant to the only D1 organization.
- The live production D1 currently contains 5 customers, 1 package, 1 subscription, 1 invoice, and 1 payment. These rows are not automatically imported or overwritten; existing local records need a dry-run/reconciliation first.
- Local SQLite tenant ID and local secret values are device-local and cannot be inferred from GitHub or Cloudflare. Activation therefore remains pending until the owner configures the local `.env` and explicit tenant mapping.
- The old generic `d1-sync-worker` five-minute cron, which wrote shadow records to `sync_records` rather than the ISP business tables, has been disabled. Its historical shadow rows are retained.
- Never run the full schema snapshot over an existing database or import live records without a reviewed reconciliation.

## Acceptance criteria

Synchronization is not considered complete until all rollout gates pass, the staging contract suite is green, duplicate replay is proven harmless, tenant-boundary tests pass, and a reconciliation report shows no unexplained data loss or duplication.
