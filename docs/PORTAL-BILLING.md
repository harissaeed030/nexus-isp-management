# Customer portal and automated billing

**Branch:** `feat/customer-portal-automated-billing`  
**Base:** `cloudflare/complete-saas`  
**Status:** source implementation only; not deployed.

## Customer portal

The Pages frontend is available at `/portal.html`. Customers sign in with their ISP workspace slug, portal email and portal password. The workspace slug is required because the same email may exist in multiple ISP tenants.

An owner or administrator opens **Customers → Customer portal access** to create an account, rotate its password, or disable access. The portal account is separate from staff users and uses a dedicated D1 table. Passwords are PBKDF2 hashes with per-account salts; raw passwords are never returned by the API.

Customer JWTs carry a customer principal type and are handled by a restricted portal router. Portal endpoints expose only the authenticated customer's own profile, subscriptions, invoices, payments and support tickets. Every data query includes both `organization_id` and `customer_id`. Portal tokens are revoked when the account is disabled, its password is reset, the customer changes their password, or the customer signs out.

### Portal API

- `POST /api/portal/auth/login` — workspace slug, email and password.
- `GET /api/portal/me` — safe customer profile, ISP details and payment instructions.
- `GET /api/portal/dashboard` — outstanding balance, active package count and open complaint count.
- `GET /api/portal/subscriptions`
- `GET /api/portal/invoices` and `GET /api/portal/invoices/:id`
- `GET /api/portal/payments`
- `GET /api/portal/tickets` and `POST /api/portal/tickets`
- `PUT /api/portal/password`
- `POST /api/portal/auth/logout`

Staff account management endpoints are tenant-scoped: `GET /api/customers/:id/portal-account` and `POST /api/customers/:id/portal-account`. Only owner/admin roles may read or change portal credentials.

## Automated recurring billing

The Worker has a Cron Trigger for `15 0 1 * *`, which runs at 05:15 Pakistan Standard Time on day one of each month. The scheduled handler calculates the period from Cloudflare's scheduled event timestamp, visits each organization and generates invoices for eligible active monthly subscriptions. It reuses the same generator as `POST /api/billing/generate`.

The existing unique index on `(organization_id, subscription_id, billing_period)` plus `INSERT OR IGNORE` protects against duplicate invoices if a scheduled run is retried. Only positive whole-rupee package prices are invoiced. Manual backfills remain available for current or past periods; future periods are rejected.

The scheduler records audit entries and in-app notifications when it creates invoices. It does not debit customer accounts, mark payments as received, or send external messages.

## Migration

The Worker migration runner adds `customer_portal_accounts` with organization/email and organization/customer uniqueness constraints and foreign keys to the owning tenant and customer. The migration is additive and uses `CREATE TABLE IF NOT EXISTS`.

The migration was committed as source only. It was **not** executed against staging or production D1 in this task. The current Worker automatically runs migrations on its first API request after deployment, and the scheduled handler also runs the migration runner; review this behavior before deployment.

## Important limitations

- The portal shows ISP-configured payment instructions but has no online payment gateway integration.
- Password provisioning is performed by an owner/admin; no email/SMS invitation or password-reset delivery is implemented.
- Invoice PDF generation remains browser print / Save as PDF, not a server-generated PDF service.
- External WhatsApp, email and SMS notifications remain unimplemented.
- SaaS platform administration still needs a platform operator identity, tenant lifecycle controls, plan catalog, usage limits and tenant billing.
- Hardware inventory remains inventory only; no live MikroTik, HSGQ OLT, ONU or GenieACS connection is asserted by this work.
