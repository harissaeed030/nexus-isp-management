# SQLite migration version registry

The SQLite migration history for the local/backend runtime uses the complete descriptive identifier stored in `schema_migrations.version`. The numeric filename prefix is a sortable sequence, not a globally reusable feature number.

| Version | Migration | Purpose |
|---|---|---|
| 001 | `001_database_hardening.sql` | Tenant constraints and indexes |
| 002 | `002_customer_subscription_management.sql` | Customer and subscription lifecycle |
| 003 | `003_mikrotik_integration.sql` | RouterOS integration fields |
| 004 | `004_olt_onu_management.sql` | OLT/ONU inventory |
| 005 | `005_tr069_genieacs.sql` | ACS/TR-069 inventory |
| 006 | `003_customer_portal_notifications.sql` | Customer portal and notification schema (legacy filename retained) |
| 007 | `007_isp_business_modules.sql` | Task 10 business operations, inventory and ledger |
| 008 | `008_financial_management.sql` | Invoice sequences, credit notes, reversals and unallocated receipts |
| 009 | `009_session_hardening.sql` | Session lifecycle metadata |

## Conflict resolution

Two independent feature branches reused numeric prefixes:

- Task 10 introduced `005_isp_business_modules.sql`, while the core line already uses version 005 for TR-069.
- Financial management introduced `002_financial_management.sql`, while the core line already uses version 002 for customer/subscription management.

Those migrations are retained, but assigned the next unused versions 007 and 008. Session hardening is assigned 009. Existing 001–006 migration IDs and SQL files are not renamed or rewritten.

## Safety rules

- Never edit or renumber a migration after it has been applied to a customer database.
- Add future migrations using the next unused numeric prefix and a descriptive suffix.
- Keep the full migration identifier in `schema_migrations.version`; do not store only the numeric prefix.
- Each migration and its ledger insert must commit in the same transaction.
- Test fresh installation and upgrade against disposable copies before applying to any live database.
- This change only updates the SQLite migration track. It does not migrate Cloudflare D1 or deploy a Worker.
