# Phase 4 — Frontend verification

## What is included

The current dashboard is a mobile-first HTML/CSS/JavaScript client:
- `index.html`: application shell, navigation and page container.
- `assets/css/styles.css`: responsive layout, sidebar, cards, tables and mobile styles.
- `assets/js/app.js`: sign-in/setup, bearer-token requests and data views.

The client currently calls these local API routes:
- `/api/v1/setup`, `/api/v1/auth/login`, `/api/v1/auth/logout`
- `/api/v1/dashboard`, `/api/v1/reports/summary`
- `/api/v1/customers`, `/api/v1/packages`, `/api/v1/subscriptions`
- `/api/v1/invoices`, `/api/v1/payments`, `/api/v1/billing/generate`
- `/api/v1/tickets`, `/api/v1/routers`, `/api/v1/staff`, `/api/v1/audit-logs`

## Android test procedure

1. Start the local backend from `backend/` with `npm install`, `npm run check` and `npm start`.
2. Open `http://127.0.0.1:4000/` in Android Chrome.
3. Use the existing local owner account. Do not create duplicate tenants if setup has already completed.
4. Confirm sign-in, dashboard loading, sign-out and sign-in again.
5. Add a clearly labelled test customer, edit it, inspect its detail panel, then remove the test record.
6. Add a test package and subscription; verify the dashboard and customer view update.
7. Generate a test invoice and record a payment that does not exceed its outstanding balance.
8. Create and update a test support ticket.
9. Check router inventory, staff, reports and audit-log pages.
10. At a 360px-wide viewport, verify the menu opens/closes, forms remain usable, and tables scroll horizontally without breaking the page.

## Integration boundary

The frontend currently targets the local `/api/v1` contract. A remote API is compatible only after its routes, JSON response shapes, bearer-token handling, preflight/CORS behavior and error responses have been verified. Do not assume the Cloudflare Worker health endpoint proves that these application endpoints exist.

Before switching to the deployed Worker:
- Verify every route above against the deployed API.
- Confirm CORS permits the actual frontend origin and Authorization/Content-Type headers.
- Confirm tenant scoping and role authorization are enforced server-side.
- Use HTTPS and keep all router, OLT, ONU, ACS and database secrets server-side.
- Run the same CRUD and billing checks against a disposable test tenant.

## Not production-complete

OLT/ONU inventory, TR-069/ACS, live MikroTik commands, staff-level permission controls, receipts/PDF, exports, backup/restore and production security review are not represented as complete merely because their navigation entries exist.
