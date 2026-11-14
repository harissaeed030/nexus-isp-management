# NEXUS Cloudflare Worker

The hosted SaaS API uses Cloudflare Workers + D1. The local Node.js/SQLite backend remains a separate offline development foundation.

## Current API capabilities

- Tenant registration and staff authentication with token revocation and role/permission checks.
- Tenant-scoped customers, packages, subscriptions, invoices, payments, refunds and support tickets.
- Customer self-service portal with workspace-slug login, profile, subscriptions, invoices, payment history, complaint submission and password changes.
- Owner/admin-controlled customer portal account creation, password reset and disable/enable actions.
- Idempotent monthly invoice generation through both the authenticated billing endpoint and a Cloudflare Cron Trigger.
- Network inventory and integration boundaries for PPPoE, OLT/ONU and ACS. Inventory is not evidence of a live hardware connection.

## Customer portal

Deploy the Pages site with `portal.html` and `assets/js/customer-portal.js`. A staff owner/admin opens Customers, selects a customer, then chooses **Customer portal access** to create or update the account. The customer signs in at `/portal.html` using the workspace slug, email and password issued by the ISP.

Portal authentication is separate from staff authentication. Customer tokens are restricted to the portal API and every customer query is scoped to its organization and customer ID. Portal passwords use the same PBKDF2 password hashing helper as staff accounts. Disabling an account or resetting its password revokes prior portal tokens.

## Automated billing

The Worker Cron Trigger is configured for `15 0 1 * *` (05:15 Pakistan Standard Time on the first day of each month). It generates the current month's invoices for active monthly subscriptions across tenants. A unique organization/subscription/billing-period index and `INSERT OR IGNORE` make retries idempotent.

The authenticated manual endpoint `POST /api/billing/generate` remains available for backfills. Future periods are rejected. The scheduled task creates invoices only; it does not collect money, send email/WhatsApp/SMS reminders, or connect to a payment gateway.

## Migration and deployment safety

- The Worker migration runner creates the customer portal account table on the first API request after deployment (or during the scheduled run).
- Do not execute `worker/schema.sql` as an initialization script; it is a source-only schema snapshot.
- This branch has not been deployed. Review the additive migration and Cron Trigger before any production deployment.
- No production D1 query, migration or data write was run as part of this change.
- Configure `JWT_SECRET`, `PPPOE_ENCRYPTION_KEY` and the exact `ALLOWED_ORIGINS` in Worker secrets/variables; never put secrets in Pages JavaScript.
- Customer online payment processing is not implemented until a verified payment gateway is selected and configured.
