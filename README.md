# Nexus — ISP Management Platform

**Mobile-first ISP operations software for FTTH providers.**

Nexus is being built as a multi-tenant platform for subscriber records, internet packages, billing, payments, support tickets and network operations.

## Current development status

The `build/nexus-isp-core` branch contains the first local API foundation:
- Local SQLite database using Node.js built-in `node:sqlite` (Node 22.13+).
- Initial owner setup, password hashing, bearer sessions and tenant-scoped API queries.
- Customer create/list/read/update/delete, package create/list/update, invoices, payments, support tickets, dashboard summary and audit log endpoints.
- SQLite database is created automatically under `backend/data/`.

This is an early development build, **not production-ready**. The existing HTML dashboard is still a prototype and has not yet been connected to all API modules. Role-based authorization beyond the initial owner account, full subscription lifecycle, billing automation, automated tests, backups and security review remain in progress. MikroTik, OLT/ONU and GenieACS/TR-069 are not connected to real equipment.

## Local setup (Android Termux or desktop)

Requirements: Node.js 22.13 or newer.

```sh
cd backend
npm install
cp .env.example .env
npm run check
npm start
```

API health check: `http://127.0.0.1:4000/api/v1/health`.

The SQLite file is created automatically at `backend/data/nexus.sqlite`. Keep this file private and backed up. Do not commit it.

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
- `GET|POST /api/v1/customers`, `GET|PATCH|DELETE /api/v1/customers/:id`
- `GET|POST /api/v1/packages`, `PATCH /api/v1/packages/:id`
- `GET|POST /api/v1/invoices`
- `GET|POST /api/v1/payments`
- `GET|POST /api/v1/tickets`, `PATCH /api/v1/tickets/:id`
- `GET /api/v1/audit-logs`

Money values are integer Pakistani rupees (PKR). Payments cannot exceed the outstanding invoice balance.

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
