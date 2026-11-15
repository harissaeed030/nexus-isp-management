# NEXUS D1 Database Schema

## Databases
| Environment | Name | UUID |
|---|---|---|
| Production | `nexus-saas-db` | `ce88098b-bff4-4d06-a0df-7bf29622a085` |
| Staging | `nexus-saas-staging-db` | `194f62e2-2766-48ab-be17-81248610c0cd` |

## Live metadata verification (2026-11-15)
Both databases have the same 23 application tables, 83 indexes and 24 triggers (Cloudflare-managed `_cf_KV` excluded). Both have migration records 0001–0007.

Application tables:
`api_keys`, `audit_log`, `customer_portal_accounts`, `customers`, `invoices`, `login_attempts`, `network_devices`, `notifications`, `onu_devices`, `organizations`, `packages`, `password_resets`, `payments`, `pppoe_accounts`, `refunds`, `schema_migrations`, `sessions`, `settings`, `subscriptions`, `support_tickets`, `ticket_messages`, `user_permissions`, `users`.

## Migration ledger
1. `0001_saas_foundation`
2. `0002_auth_sessions`
3. `0003_isp_modules`
4. `0004_add_missing_columns_and_tables`
5. `0005_sync_staging_schema`
6. `0006_d1_tenant_integrity_guards`
7. `0007_customer_portal_tenant_guards`

## Tenant controls
D1 contains organization-scoped unique/query indexes and tenant-integrity triggers. Migration 0006 adds D1 tenant integrity guards. Migration 0007 adds `customer_portal_accounts` and insert/update triggers preventing portal accounts from referencing customers in a different organization.

## Production data counts
- Organizations: 1
- Users: 1
- Customers: 0
- Invoices: 0
- Payments: 0
- Customer portal accounts: 0

## Schema parity
The production and staging metadata queries returned the same object names and counts. Five SQL DDL strings differ in whitespace/formatting; no object-name/count mismatch was found. The 0001–0005 SQL migration artifacts are not present in the current repository history; use the recorded migration ledger and do not fabricate or replay those historical migrations.

## Backup and integrity
Repository release notes record a Cloudflare D1 export before production migration 0007, with an export bookmark recorded in `cloudflare/d1/README.md`. The signed export URL is temporary and is not stored in Git.

Cloudflare's D1 query API rejected PRAGMA commands with `SQLITE_AUTH` during this audit. Consequently, live `foreign_key_check` and `integrity_check` outcomes are not certified here. Arrange a supported integrity check and restore rehearsal before declaring database disaster recovery ready.

**Safety:** Never run `worker/schema.sql` against either existing database. It is a snapshot for initializing an empty database. Existing installations must use additive, idempotent migrations only.
