# NEXUS Cloudflare D1 schema reconciliation

Cloudflare Workers use organizations/organization_id. The separate Node SQLite backend uses tenants/tenant_id; its migrations must never be applied to Cloudflare D1.

Baseline checked 2026-11-15:
- Production: 22 app tables, schema_migrations rows 0001-0005.
- Staging: same 22 baseline tables plus customer_portal_accounts; schema_migrations empty.
- Both PRAGMA foreign_key_check results were empty.
- Five production indexes were non-unique while staging had unique partial definitions.
- Some related IDs lack same-organization enforcement; migration 0006 adds trigger guards.
- Staging contains test data; never reset it.

Before 0006, run duplicate checks:
SELECT organization_id,invoice_number,COUNT(*) n FROM invoices GROUP BY 1,2 HAVING n>1;
SELECT organization_id,subscription_id,billing_period,COUNT(*) n FROM invoices WHERE subscription_id IS NOT NULL AND billing_period IS NOT NULL GROUP BY 1,2,3 HAVING n>1;
SELECT organization_id,transaction_ref,COUNT(*) n FROM payments WHERE transaction_ref IS NOT NULL AND transaction_ref<>'' GROUP BY 1,2 HAVING n>1;
SELECT organization_id,idempotency_key,COUNT(*) n FROM refunds WHERE idempotency_key IS NOT NULL AND idempotency_key<>'' GROUP BY 1,2 HAVING n>1;
SELECT organization_id,reference,COUNT(*) n FROM refunds WHERE reference IS NOT NULL AND reference<>'' GROUP BY 1,2 HAVING n>1;

Rollout:
1. Full SQL exports of both D1 databases completed before changes.
2. Apply 0006 to staging first; it adopts verified baseline ledger rows 0001-0005 if missing and records 0006 after guards.
3. Run verification/tenant-integrity.sql, PRAGMA foreign_key_check and negative cross-org tests on staging.
4. Only after staging passes, apply 0006 to production and repeat checks.
5. Apply 0007 to staging only. Production Worker does not currently include customer portal routes.

No business tables or rows are dropped. Indexes are recreated to align uniqueness. Triggers are idempotent. If a statement fails, stop and inspect before resuming.