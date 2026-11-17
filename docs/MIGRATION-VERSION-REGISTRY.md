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
| 010 | `010_payment_promises.sql` | Customer payment commitment dates and status tracking |

## Conflict resolution

Two independent feature branches reused numeric prefixes:

- Task 10 introduced `005_isp_business_modules.sql`, while the core line already uses version 005 for TR-069.
- Financial management introduced `002_financial_management.sql`, while the core line already uses version 002 for customer/subscription management.

Those migrations are retained, but assigned the next unused versions 007 and 008. Session hardening is assigned 009. Payment promises are assigned 010. Existing 001–006 migration IDs and SQL files are not renamed or rewritten.

## Safety rules

- Never edit or renumber a migration after it has been applied to a customer database.
- Add future migrations using the next unused numeric prefix and a descriptive suffix.
- Keep the full migration identifier in `schema_migrations.version`; do not store only the numeric prefix.
- Each migration and its ledger insert must commit in the same transaction.
- Test fresh installation and upgrade against disposable copies before applying to any live database.
- This change only updates the SQLite migration track. It does not migrate Cloudflare D1 or deploy a Worker.


## Cloudflare D1 migration track

The D1 Worker schema has a separate numeric migration ledger; these IDs are not SQLite migration versions.

| ID | Migration | Purpose |
|---|---|---|
| 0012 | `0012_customer_workspace_compatibility.sql` | Customer workspace compatibility |
| 0013 | `0013_subscription_workspace_status.sql` | Subscription workspace status |
| 0014 | `0014_router_credential_cipher.sql` | Encrypted RouterOS credential storage |
| 0015 | `0015_genieacs_tr069_inventory.sql` | Tenant-scoped ACS connections, TR-069 devices and audit records |

Apply D1 migrations only after a verified backup, checking the live `schema_migrations` ledger and the exact production/staging schema. The development branch does not automatically apply these files to either database.
