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
- Staff account management with role defaults and per-user module permission overrides, router inventory, idempotent monthly invoice generation and financial summary reports.
- Mobile-friendly dashboard served by the same local API, with owner sign-in/initial setup and forms for the core ISP records.
- SQLite database is created automatically under `backend/data/`.

This is an early development build, **not production-ready**. The dashboard now uses the local API for core records, but scheduled hands-free recurring billing, invoice PDF/receipts, CSV exports, backup/restore, additional integration tests and a production security review remain unfinished. Router records are inventory only: no RouterOS credentials are stored and no MikroTik commands are sent. OLT/ONU and GenieACS/TR-069 are not connected to real equipment. Do not use it as the only system of record for live customers until backups and testing are in place.

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

The SQLite file is created automatically at `backend/data/nexus.sqlite`. Keep this file private and backed up. Do not commit it.

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

- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`
- `GET /api/v1/dashboard`
- `GET|POST /api/v1/customers` (search/filter: `q`, `status`, `connectionStatus`, `coverageArea`; pagination: `page`, `pageSize`), `GET|PATCH|DELETE /api/v1/customers/:id`
- `GET /api/v1/customers/:id/profile`, `GET /api/v1/customers/:id/history`
- `GET|POST /api/v1/packages`, `PATCH /api/v1/packages/:id`
- `GET|POST /api/v1/subscriptions`, `PATCH /api/v1/subscriptions/:id`, `POST /api/v1/subscriptions/:id/renew`
- `GET|POST /api/v1/invoices`
- `GET|POST /api/v1/payments`
- `GET|POST /api/v1/tickets`, `PATCH /api/v1/tickets/:id`
- `GET /api/v1/audit-logs`
- `GET|POST /api/v1/staff`, `PATCH /api/v1/staff/:id` (owner/admin only)
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

## License

All rights reserved until a license is added. Do not assume this project is open source for reuse or resale.
