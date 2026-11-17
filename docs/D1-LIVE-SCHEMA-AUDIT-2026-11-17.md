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

**Resolved source-level migration collision:** the first security-hardening draft used migration ID 14, which conflicts with staging's existing `0014_router_credential_cipher`. That draft was not applied to either live database. The development migration has now been moved to ID 22 (`0022_security_hardening`), which was not present in either inspected ledger. Its SQL, test fixture, and source-contract guard have been updated together. This is a source correction only; it does not mean migration 0022 has been applied.

## Schema object differences observed

The staging database contains additional feature objects absent from production, including:

- Network connector/job objects: `network_connectors`, `network_jobs`.
- TR-069/ACS objects: `acs_connections`, `tr069_devices`, `tr069_audit_logs`.
- Field/business operations objects: `business_partners`, `cash_collections`, `connection_applications`, `coverage_areas`, `customer_ledger_entries`, `field_assignments`, `geo_locations`, `inventory_items`, `inventory_movements`, `payment_promises`, `recovery_officers`, `router_customer_mappings`.

Production and staging therefore do not currently have feature/schema parity. This audit compared schema object names and migration ledger entries only; it did not claim column-level equivalence or inspect business records.

## Required safe follow-up

1. Treat the production and staging migration ledgers as separate histories; do not copy a ledger or schema snapshot between them.
2. Keep migration 0022 as the security-hardening version; do not reuse IDs 14–21, which already exist in staging.
3. Build a production-specific additive migration plan for any required network/field modules. Reconcile every table and column against the actual production schema before writing SQL.
4. Take and verify fresh backups before any staging or production D1 mutation.
5. Apply to staging only after a separate migration rehearsal and explicit deployment approval; production remains untouched until staging acceptance and a fresh production preflight pass.

## Safety boundary

This document records a read-only audit and a source-level migration renumbering. It does not authorize or perform D1 writes, Worker/Pages deployment, secret changes, customer-data changes, or live network-device operations.
