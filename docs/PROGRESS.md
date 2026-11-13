# NEXUS Development Progress

**Updated:** 2026-11-13  
**Active branch:** `cloudflare/complete-saas`  
**Production branch:** `dev` (unchanged)

## Current architecture decision

The selected hosted SaaS architecture is Cloudflare Workers + D1. The local Node.js/SQLite backend remains in the repository as a preserved offline development foundation, not as the active hosted API.

## Implemented in the current development branch

- Cloudflare production Worker source synchronized into GitHub.
- Additive sequential D1 migration runner.
- Tenant-scoped staff permission overrides and server-side enforcement.
- Token revocation on logout, password change and staff security changes.
- Monthly subscription invoice generation with duplicate prevention.
- Financial validation, atomic payment recording, overpayment protection and outstanding balances.
- CSV exports with tenant scope and spreadsheet formula-injection protection.
- PPPoE account management UI.
- OLT and ONU/ONT inventory UI and APIs.
- ACS endpoint inventory UI.
- Connection status overview with no fabricated live state.
- Company settings, currency and profile screens.
- Tenant/user-scoped notification inbox, unread counts, read actions and automatic ticket/payment alerts.
- Refund request and processing workflow with over-refund protection, unique references, idempotency keys and invoice-balance reconciliation.
- Owner-level staff administration fixes, including protection against editing/deleting the owner or non-owner changes to administrator accounts.
- Basic JavaScript syntax checks and Pages preview deployment.

## Basic verification

- Worker JavaScript syntax: passed.
- Frontend JavaScript syntax: passed.
- Latest Worker and frontend source syntax checked after notification/refund changes.
- Refund schema, indexes and idempotency column applied to staging D1 only; refund insert/reconciliation SQL plans and net-payment query accepted by D1.
- Latest code changes are saved on the development branch and have not been deployed.
- Cloudflare Pages feature-branch preview: successful.
- Production Worker deployment: unchanged.
- Production D1 data: unchanged.

These are build checks only. Comprehensive acceptance, security, integration, concurrency and load testing has not started.

## Remaining development

1. Secure live MikroTik RouterOS connector and PPPoE provisioning.
2. HSGQ OLT management and automatic ONU discovery/telemetry.
3. Authenticated GenieACS NBI / TR-069 operations.
4. Customer self-service portal and online customer workflows.
5. Scheduled recurring billing, PDF invoices and receipts.
6. Notifications, WhatsApp/email/SMS and payment-gateway integrations.
7. SaaS tenant administration, plans, usage limits and tenant billing.
8. Backup/restore and operational monitoring.
9. Finish all remaining frontend/API connections.

## Final testing milestone

Do not begin the comprehensive final testing phase until all planned software modules and integrations have been implemented. Continue essential security safeguards and basic syntax/build checks during development.
