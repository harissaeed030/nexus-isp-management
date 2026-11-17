# Live D1 schema and migration ledger audit — 2026-11-17

**Scope:** read-only Cloudflare API inspection of the existing NEXUS production and staging D1 databases.
**No SQL writes, migrations, Worker deployments, secret reads, or customer-row queries were performed.**

## Databases inspected

| Environment | Database | Database ID |
|---|---|---|
| Production | `nexus-saas-db` | `ce88098b-bff4-4d06-a0df-7bf29622a085` |
| Staging | `nexus-saas-staging-db` | `194f62e2-2766-48ab-be17-81248610c0cd` |

## Migration ledger observations

The production ledger contains IDs 1–10, 12, 13 and 100. The staging ledger contains IDs 1–21 (including ID 11) and 100.

| ID | Production | Staging |
|---:|---|---|
| 10 | `0010_pppoe_connection_metadata` | `0010_pppoe_connection_metadata` |
| 11 | Not recorded | `0011_sync_staging_with_production` |
| 12 | `0012_customer_workspace_compatibility` | `0012_customer_workspace_compatibility` |
| 13 | `0013_subscription_workspace_status` | `0013_subscription_workspace_status` |
| 14 | Not recorded | `0014_router_credential_cipher` |
| 15–21 | Not recorded | Additional staging-only migrations through `0021_field_operations` |
| 100 | `sync_ledger_and_failures_tables` | `sync_ledger_and_failures_tables` |

**Critical migration-ID collision:** the current development change `cloudflare/d1/migrations/0014_security_hardening.sql` also claims D1 migration ID 14. Staging already records ID 14 as `0014_router_credential_cipher`. Do not apply the security-hardening migration to staging under ID 14, and do not assume an `INSERT OR IGNORE` ledger write proves that migration was recorded. A new globally unused migration ID and a reviewed upgrade path are required.

## Schema object differences observed

The staging database contains additional feature objects absent from production, including:

- Network connector/job objects: `network_connectors`, `network_jobs`.
- TR-069/ACS objects: `acs_connections`, `tr069_devices`, `tr069_audit_logs`.
- Field/business operations objects: `business_partners`, `cash_collections`, `connection_applications`, `coverage_areas`, `customer_ledger_entries`, `field_assignments`, `geo_locations`, `inventory_items`, `inventory_movements`, `payment_promises`, `recovery_officers`, `router_customer_mappings`.

Production and staging therefore do not currently have feature/schema parity. This audit compared schema object names and migration ledger entries only; it did not claim column-level equivalence or inspect business records.

## Required safe follow-up

1. Treat the production and staging migration ledgers as separate histories; do not copy a ledger or schema snapshot between them.
2. Assign security hardening a migration ID that is unused in both environments, then update the migration registry, SQL, fixtures, and CI checks together.
3. Build a production-specific additive migration plan for any required network/field modules. Reconcile every table and column against the actual production schema before writing SQL.
4. Take and verify fresh backups before any staging or production D1 mutation.
5. Apply to staging only after a separate migration rehearsal and explicit deployment approval; production remains untouched until staging acceptance and a fresh production preflight pass.

## Safety boundary

This document records a read-only audit. It does not authorize or perform D1 writes, Worker/Pages deployment, secret changes, customer-data changes, or live network-device operations.
