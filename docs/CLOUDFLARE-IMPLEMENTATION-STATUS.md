# NEXUS Cloudflare implementation status

**Updated:** 2026-11-13  
**Active implementation branch:** `cloudflare/complete-saas`  
**Production Pages branch:** `dev` (unchanged)  
**Backend decision:** Cloudflare Workers + D1  
**Production API:** `https://nexus-saas-api.harissaeed030.workers.dev`

## Environment safety

- The implementation branch is based on the existing `dev` branch.
- The production Pages branch and production Worker were not changed.
- No D1 migrations were applied to production during this implementation pass.
- The production D1 database was inspected read-only. It currently has one organization (Vancom Networks) and one user; customer, package, subscription, invoice and payment tables had no records at audit time.
- The existing organization currency is currently `USD`. The new Workspace Settings screen can change it; it was not changed automatically.
- The Cloudflare Pages preview for the implementation branch is available at: https://90c492bc.nexus-isp-management.pages.dev

## Implemented in the development branch

- Synchronized the active deployed Cloudflare Worker source into the implementation branch.
- Sequential, additive D1 migrations that stop API requests when a required migration fails; migrations run only for API requests, not preflight or static requests.
- Tenant-scoped staff permission overrides, API-side permission enforcement and current-role lookup on requests.
- Token-version revocation on logout, password changes and staff role/status/password changes.
- Monthly invoice generation with tenant/subscription/period uniqueness.
- Invoice amount, tax, due-date and customer/subscription validation.
- Payment amount and method validation, transaction-reference uniqueness, overpayment protection and atomic payment insertion/reconciliation.
- Partial payments are represented using the existing D1 invoice status constraint; the API derives a display status and paid/outstanding amounts.
- Dashboard outstanding balances include partially paid invoices.
- Tenant-scoped CSV exports for customers, packages, subscriptions, invoices, payments, tickets, routers, OLTs, ACS endpoints, PPPoE and ONU inventory. Passwords are excluded and spreadsheet formula injection is mitigated.
- PPPoE account management UI using the existing encrypted-password API.
- OLT inventory with model, management protocol and PON-port fields.
- ONU/ONT inventory with serial number, customer/OLT assignment, PON placement, status and manually entered RX power.
- ACS endpoint inventory.
- Connection overview that explicitly reports live connectivity as untested until a real connector exists.
- Workspace settings and user profile screens, including currency selection.
- Tenant/user-scoped notification inbox, read/unread actions and automatic admin alerts for tickets and payments.
- Refund ledger with pending/completed/failed states, unique references, idempotency keys, over-refund protection and invoice balance reconciliation.
- Invoice detail printing with browser Save as PDF and payment history; server-generated PDF/receipt service remains outstanding.
- Owner/admin staff-management authorization corrected; owner account and administrator controls are protected.
- Basic GitHub Actions syntax checks for Worker and frontend JavaScript.

## Not yet implemented or connected

1. Real MikroTik RouterOS provisioning, active-session queries, suspend/reactivate and live health checks.
2. Real HSGQ OLT management and automatic ONU discovery/telemetry.
3. Authenticated GenieACS NBI integration and TR-069 remote operations. ACS screen is inventory only.
4. A secure connector/VPN path from the Cloudflare Worker to private ISP network devices.
5. Customer self-service portal, customer login, online registration, invoices and complaint tracking.
6. Server-generated PDF invoices, printable payment receipts and scheduled automatic recurring billing; invoice browser print/Save as PDF is available. Monthly invoice generation currently requires an authorized API action.
7. Email, WhatsApp, SMS and payment-gateway integrations.
8. SaaS platform-owner tenant administration, subscription plans, usage limits and tenant billing.
9. Backup/restore workflows and operational monitoring.
10. Final comprehensive testing, bug fixing, load/concurrency testing and production readiness review.

## Development sequence

1. Complete the network connector architecture and real MikroTik/OLT/ACS integrations.
2. Complete the customer portal and customer-facing workflows.
3. Complete scheduled billing, PDF invoices and receipts.
4. Complete notifications, payment integrations and SaaS tenant administration.
5. Finish all remaining screens and API connections.
6. Only then begin the comprehensive final testing phase.

## Verification boundary

Worker and frontend JavaScript syntax checks passed after notification/refund changes. Refund schema, indexes and idempotency column were applied and inspected in staging D1 only; refund insert/reconciliation SQL plans and the net-payment SQL query were accepted by D1. The earlier Pages preview deployment succeeded; the latest source commits have not been deployed. These are basic build checks only. No claim is made that the complete application has passed acceptance, security, integration or production-readiness testing.
