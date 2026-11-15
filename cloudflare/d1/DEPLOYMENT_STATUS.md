# NEXUS D1 deployment status — 2026-11-15

## Backups
Full SQL exports completed before D1 schema changes.

- Production: ce88098b-bff4-4d06-a0df-7bf29622a085-00000077-00000000-00005124-bade5c35e745831421df8b257465b759.sql
- Staging: 194f62e2-2766-48ab-be17-81248610c0cd-00000034-00000000-00005124-894d523e6f69adb3d8ffff7c9d32ec08.sql

## Applied changes
- Production: migration 0006_d1_tenant_integrity_guards applied; ledger now contains 0001-0006.
- Staging: baseline ledger entries 0001-0005 reconciled, migration 0006 applied, and staging-only 0007_customer_portal_tenant_guards applied; ledger now contains 0001-0007.
- Production unique indexes now match the stronger staging definitions for invoice number, subscription-period invoice, payment reference, refund idempotency key and refund reference.
- Both environments now have same-organization trigger guards for subscription, invoice, payment, PPPoE, support-ticket/assignee, ticket-message, staff-permission, ONU/customer/OLT, refund, notification and audit-actor relationships.
- Staging additionally has customer-portal-account customer/organization guards.

## Post-migration verification
| Check | Production | Staging |
|---|---:|---:|
| Migration ledger latest | 0006 | 0007 |
| D1 integrity triggers | 22 | 24 |
| PRAGMA foreign_key_check violations | 0 | 0 |
| Subscription relationship violations | 0 | 0 |
| Invoice relationship violations | 0 | 0 |
| Payment relationship violations | 0 | 0 |
| PPPoE relationship violations | 0 | 0 |
| Support-ticket relationship violations | 0 | 0 |
| Staff-permission relationship violations | 0 | 0 |
| ONU relationship violations | 0 | 0 |
| Refund relationship violations | 0 | 0 |

The five duplicate preflight checks returned zero in both databases before unique indexes were created.

## Remaining validation boundary
Read-only post-migration integrity checks passed. Negative write attempts against triggers were not run in this session, so this report does not claim that application-level cross-tenant write tests passed. Existing application-level security tests remain a separate release gate.

## Architecture note
Cloudflare Workers D1 uses organizations/organization_id. The local Node/SQLite backend uses tenants/tenant_id. These are separate schemas; never apply backend/migrations SQL to Cloudflare D1. Production does not yet include the staging customer portal route, so migration 0007 remains staging-only.
