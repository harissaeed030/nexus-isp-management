# Nexus — ISP Management Platform

**Mobile-first ISP operations software for FTTH providers.**

Nexus is being built as a multi-tenant platform for subscriber records, internet packages, billing, payments, support tickets and network operations.

## Current development status

The `build/nexus-isp-core` branch contains the first local API foundation:
- Local SQLite database using Node.js built-in `node:sqlite` (Node 22.13+).
- Initial owner setup, password hashing, bearer sessions and tenant-scoped API queries.
- Customer registration and CRUD with tenant-scoped account-number sequencing, service address, coverage area, installation date, account/connection status, searchable filters and pagination.
- Customer profile views with subscription, invoice, payment, complaint, connection and subscription history.
- Subscription assignment, package changes, start/expiry dates, renewal, suspension/resume/cancellation history and automatic expiry transition when subscription lists or customer profiles are read.
- Package management, invoices, payment ledger, support tickets, dashboard totals and audit log endpoints.
- Staff account management with role defaults and per-user module permission overrides, encrypted MikroTik router credentials, RouterOS API-SSL operations, OLT/ONU inventory, GenieACS/TR-069 adapter endpoints, idempotent monthly invoice generation and financial summary reports.
- ISP business operations APIs for coverage areas, connection applications, dealers/partners, recovery officers, cash collections, customer ledger entries and stock/inventory movements.
- Dashboard screens for HSGQ-G04R OLT and ONU inventory, coverage areas, new connection queries, dealers, recovery officers, collections and equipment stock.
- Mobile-friendly dashboard served by the same local API, with owner sign-in/initial setup and forms for the core ISP records.
- SQLite database is created automatically under `backend/data/`.

This is an early development build, **not production-ready**. The dashboard now uses the local API for core records, but automatic monthly billing is now available as an opt-in scheduler (05:15 Asia/Karachi on day 1; missed runs catch up after the first day, and each tenant/billing period is idempotent). It is disabled by default and must be explicitly enabled with `AUTO_BILLING_ENABLED=true`. CSV exports for customers, invoices, payments and support tickets are available from the Reports screen with optional date filters. Additional device-provider integration and a production security review remain unfinished. Database backup/restore utilities are implemented but still require an operational restore rehearsal before production. MikroTik support includes encrypted credential storage and server-side RouterOS API-SSL operations, but live router acceptance testing remains pending. OLT/ONU records and GenieACS/TR-069 routes are available, but live HSGQ-G04R communication, optical telemetry and ONU provisioning are not claimed until vendor-specific interfaces are verified. Do not use it as the only system of record for live customers until backups and testing are in place.

## Local setup (Android Termux or desktop)

Requirements: Node.js 22.13 or newer.

```sh
cd backend
npm install
cp .env.example .env
npm run check
npm start
```

Open the dashboard in your phone browser: `http://127.0.0.1:4000/`.

API health check: `http://127.0.0.1:4000/api/v1/health`.

The SQLite file is created automatically at `backend/data/nexus.sqlite`. Keep this file private and backed up. Do not commit it. Customer portal and notification migration `003_customer_portal_notifications.sql` is applied automatically on startup. Automatic monthly billing is disabled by default; add `AUTO_BILLING_ENABLED=true` to the server environment only after reviewing the monthly invoice workflow. It runs per tenant at 05:15 Pakistan time on the first day of each month, with safe catch-up after downtime and duplicate-period protection.

### Database migrations, backup and restore

The database initializer maintains a `schema_migrations` ledger. Existing 0.2.0 databases are upgraded automatically on next startup by additive migrations in `backend/migrations/001_database_hardening.sql` and `backend/migrations/002_customer_subscription_management.sql`; they preserve existing rows and add tenant-consistency triggers, customer account sequencing, connection/subscription history and query indexes. Do not manually delete the SQLite file to apply a migration.

Run commands from the `backend/` directory:

```sh
npm run db:backup
npm run db:backup -- ./backups/before-upgrade.sqlite
npm run db:restore -- ./backups/before-upgrade.sqlite
npm run verify
```

Backups use SQLite's online-consistent `VACUUM INTO` operation, are written with owner-only file permissions where supported, and are checked with `PRAGMA integrity_check` and `PRAGMA foreign_key_check`. Restore refuses invalid backups, retains a validated pre-restore safety backup, and validates the restored file before replacing the live database. **Stop the Nexus server before restore**; restart it afterward so pending migrations can run. Keep backup files private and outside Git.


## NEXUS AI Assistant (Gemini)

The dashboard includes a mobile-friendly AI chat panel. The backend calls the Gemini API; the browser never receives the API key. Configure `GEMINI_API_KEY` in `backend/.env` or the server secret store, optionally set `GEMINI_MODEL` (default `gemini-2.5-flash`), and restart the API. The endpoint is `POST /api/v1/ai/chat`, requires the `ai.chat` permission, limits requests and message history, and sends no customer records, payment information, router credentials or ONU data to Gemini. The assistant gives guidance only and cannot execute ISP operations. Without a key it returns a clear 503 response and the rest of NEXUS continues to work.

## First owner setup

Send a POST request to `/api/v1/setup` with JSON:
```json
{
  "companyName": "Your ISP Name",
  "fullName": "Owner Name",
  "email": "owner@example.com",
  "password": "use-a-long-private-password"
}
```
The first setup creates the tenant and owner. The API returns a bearer token. Keep it private. Setup is locked after the first user exists.

### Recovering a local owner password

If the owner login stops working, run this from the `backend` directory. It only resets a uniquely matching owner account in the configured SQLite database, asks for the new password without echoing it, and revokes existing sessions:

```sh
npm run auth:reset -- owner@example.com
```

Do not delete `backend/data/nexus.sqlite` to fix a login problem; that file contains the ISP's local data.

## API overview

All endpoints except health, root, initial setup and login require `Authorization: Bearer <token>`.

- `POST /api/v1/auth/login` accepts `email`, `password`, and optional `tenantSlug`; the slug is required only when the same email/password matches accounts in more than one workspace. `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`.
- `GET /api/v1/dashboard`
- `GET|POST /api/v1/customers` (search/filter: `q`, `status`, `connectionStatus`, `coverageArea`; pagination: `page`, `pageSize`), `GET|PATCH|DELETE /api/v1/customers/:id`
- `GET /api/v1/customers/:id/profile`, `GET /api/v1/customers/:id/history`
- `GET|POST /api/v1/packages`, `PATCH /api/v1/packages/:id`
- `GET|POST /api/v1/subscriptions`, `PATCH /api/v1/subscriptions/:id`, `POST /api/v1/subscriptions/:id/renew`
- `GET|POST /api/v1/invoices`
- `GET|POST /api/v1/payments`
- `GET|POST /api/v1/tickets`, `PATCH /api/v1/tickets/:id`
- Customer portal: `/portal` (customer login, package, invoices, dues, payments and complaints)
- `POST /api/v1/customer-portal/login`, `GET /api/v1/customer-portal/me`, `GET /api/v1/customer-portal/invoices`, `GET /api/v1/customer-portal/payments`, `GET|POST /api/v1/customer-portal/complaints`, `POST /api/v1/customer-portal/logout`
- Staff customer portal provisioning: `POST /api/v1/portal-admin/customers/:customerId/account`, `POST /api/v1/portal-admin/customers/:customerId/reset-password`
- Notification console: `/notifications`; templates, queued messages, provider send/retry and delivery history under `/api/v1/notifications/*`
- WhatsApp Cloud API uses Meta-approved template names and language codes for template sends (optional provider template name on each local template); without a provider template name, the API sends a free-form text message subject to Meta's 24-hour customer-care window. WhatsApp Cloud API secrets are server-only environment variables: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`. Configure the Meta webhook callback to `/api/v1/notifications/whatsapp/webhook`; the endpoint verifies the provider signature before accepting delivery updates.
- ISP operations: `GET|POST /api/v1/operations/coverage-areas`, `PATCH /api/v1/operations/coverage-areas/:id`, `GET|POST /api/v1/operations/applications`, `PATCH /api/v1/operations/applications/:id`, `GET|POST /api/v1/operations/partners`, `GET|POST /api/v1/operations/recovery-officers`, `GET|POST /api/v1/operations/collections`, `GET|POST /api/v1/operations/payment-promises`, `PATCH /api/v1/operations/payment-promises/:id`, `GET|POST /api/v1/operations/locations`, `GET|POST /api/v1/operations/assignments`, `PATCH /api/v1/operations/assignments/:id`, `GET|POST /api/v1/operations/inventory`, `POST /api/v1/operations/inventory/:id/movements`, `GET /api/v1/operations/customer-ledger/:customerId`.
- AI assistant: `POST /api/v1/ai/chat` (server-side Gemini proxy; requires `ai.chat`).\n- CSV exports: `GET /api/v1/exports/customers.csv`, `GET /api/v1/exports/invoices.csv`, `GET /api/v1/exports/payments.csv`, `GET /api/v1/exports/tickets.csv` (optional `from` and `to` date filters in `YYYY-MM-DD`; tenant-scoped and permission-checked).\n- CSV exports: `GET /api/v1/exports/customers.csv`, `GET /api/v1/exports/invoices.csv`, `GET /api/v1/exports/payments.csv`, `GET /api/v1/exports/tickets.csv` (optional `from` and `to` date filters in `YYYY-MM-DD`; tenant-scoped and permission-checked).\n- `GET /api/v1/audit-logs`
- `GET|POST /api/v1/staff`, `PATCH /api/v1/staff/:id` (owner/admin only)
- `GET|POST /api/v1/olts`, `PATCH|DELETE /api/v1/olts/:id`, `GET /api/v1/olts/:id/capabilities`
- `GET /api/v1/olts/:id/pons`, `PATCH /api/v1/pons/:id`
- `GET|POST /api/v1/onus`, `PATCH|DELETE /api/v1/onus/:id`, `POST /api/v1/onus/:id/service-mapping`, `GET /api/v1/onus/:id/history`
- `GET|POST /api/v1/olt-alarms`, `PATCH /api/v1/olt-alarms/:id/clear`
- `GET /api/v1/olts/:id/monitoring` (inventory/capability response; live telemetry pending verified HSGQ interface documentation)
- `GET|PUT /api/v1/staff/:id/permissions` (owner/admin only)

Money values are integer Pakistani rupees (PKR). Payments cannot exceed the outstanding invoice balance.

Staff roles have safe defaults (owner, admin, billing, NOC, support, technician and limited staff). Owners and administrators can grant or revoke individual module permissions for non-owner staff accounts. Permission changes are checked by the API on every request; dashboard checkboxes are not a security boundary.

## Security rules

- Never commit passwords, tokens, database files, router credentials or customer records.
- Do not expose network-device credentials in browser JavaScript.
- Keep tenant scoping enforced in API queries.
- Use HTTPS, proper role permissions, backups and security review before production use.

## Roadmap

1. Local SQLite API and data model.
2. Connect dashboard UI to authentication and CRUD modules.
3. Complete subscriptions, invoices, payment receipts and reports.
4. Add staff roles, permissions, tests and backup/restore.
5. Add MikroTik adapter and equipment inventory.
6. Add vendor-specific OLT/ONU and GenieACS/TR-069 adapters.
7. Review deployment architecture and production migration.

## HSGQ-G04R hardware integration
See [docs/HSGQ-G04R-INTEGRATION.md](docs/HSGQ-G04R-INTEGRATION.md) for verified management methods, adapter limitations, credential encryption and the vendor documentation required before enabling live telemetry.

## License

All rights reserved until a license is added. Do not assume this project is open source for reuse or resale.


## Shared SQLite + Cloudflare D1 persistence

Live production/staging D1 drift and the safe reconciliation gates are documented in [Production and Staging D1 Reconciliation](docs/PRODUCTION-STAGING-D1-RECONCILIATION-2026-11-17.md).

The shared asynchronous database adapter and tenant-scoped repository are implemented in `shared/database/`. The local SQLite runtime exports it as `repository`, and the isolated SQLite-to-D1 sync Worker uses the shared D1 repository for tenant-scoped record reads.

See [Shared database architecture](docs/SHARED-DATABASE-ARCHITECTURE.md) for the adapter contract, schema mappings, safety guarantees, migration boundaries and current integration limitations.

From `backend/`, run:

```sh
npm install
npm run check
node --test scripts/shared-database.test.js
```

This is an incremental persistence-layer migration: legacy Express handlers remain on the existing synchronous SQLite API until each module is migrated. The shared metadata currently covers customers, packages, subscriptions, invoices and payments; it does not imply complete schema parity for credentials, staff, tickets, network inventory or every production API.
