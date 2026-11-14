# NEXUS Development Progress

**Updated:** 2026-11-14  
**Active branch:** `feat/customer-portal-automated-billing`  
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
- Printable invoice view with browser print / Save as PDF workflow and payment history.
- Customer self-service portal: separate customer authentication, tenant/customer-scoped profile, subscriptions, invoices, payment history, complaints and password change.
- Owner/admin portal-account provisioning, password reset and access disable/enable.
- Monthly recurring invoice generation on a Cloudflare Cron Trigger, using the existing unique subscription-period index for retry-safe duplicate prevention.
- Owner-level staff administration fixes, including protection against editing/deleting the owner or non-owner changes to administrator accounts.
- Basic JavaScript syntax checks and Pages preview deployment.

## Basic verification

- Worker JavaScript syntax: passed.
- Feature-branch GitHub Actions run #63 passed on 2026-11-14; Node syntax checks covered the Worker, admin frontend and customer portal frontend.
- In-memory SQLite checks passed for the portal-account migration DDL, tenant/customer-scoped invoice reads, net payment after completed refunds and duplicate monthly invoice prevention.
- No staging or production D1 migration/data write, Worker deployment or Pages deployment was performed for this milestone.
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
4. Server-generated PDF invoices and printable payment receipts (browser print / Save as PDF is available).
5. External WhatsApp/email/SMS and verified payment-gateway integrations.
6. SaaS platform administration: platform operator identity, tenant lifecycle controls, plan catalog, usage limits and tenant billing.
7. Backup/restore drills and operational monitoring.
8. Finish remaining frontend/API connections and integration tests.

## Customer portal and recurring billing milestone (2026-11-14)

- Customer portal and scheduled monthly billing are implemented on the feature branch.
- The portal account migration is additive and remains source-only until a Worker deployment runs the migration runner.
- Cron configuration is source-only; no production deployment or D1 migration was performed.
- Online customer payment gateway and external messaging are intentionally not claimed as implemented.

## Final testing milestone

Do not begin the comprehensive final testing phase until all planned software modules and integrations have been implemented. Continue essential security safeguards and basic syntax/build checks during development.
