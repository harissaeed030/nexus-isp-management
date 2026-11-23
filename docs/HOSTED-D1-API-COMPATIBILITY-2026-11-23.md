# Hosted D1 API compatibility — 2026-11-23

## Purpose

The browser dashboard calls the versioned `/api/v1/*` contract used by the local Express/SQLite runtime. The hosted Cloudflare Worker keeps its established `/api/*` route names. This branch adds a small, explicit compatibility layer at the production Worker boundary; it does not make the local SQLite file and D1 a live replica.

## Compatibility implemented

- `POST /api/v1/setup` → `POST /api/auth/register` (the D1 registration handler already accepts `companyName` and `fullName`).
- `GET /api/v1/dashboard` → `GET /api/dashboard/stats`; response now includes the nested `stats` object expected by the shared dashboard while retaining the existing top-level fields.
- `GET /api/v1/reports/summary` → a new D1-backed summary response with monthly revenue and outstanding receivables.
- `/api/v1/tickets/*` → `/api/complaints/*`.
- `/api/v1/routers/*` → `/api/network/devices/*`.
- PATCH updates for individual customer and complaint resources are normalized to the Worker’s existing PUT handlers. CORS preflight now advertises PATCH.

All mappings are path-only and preserve query strings on the original URL. Authorization and tenant scoping still run in the existing Worker handlers after normalization.

## Deliberately not mapped

The following local SQLite routes do not yet have equivalent hosted D1 contracts and must not be pointed at unrelated tables as a shortcut:

- `/api/v1/acs/connections`
- `/api/v1/tr069/devices` and `/api/v1/tr069/audit-logs`
- `/api/v1/financial/aging`
- `/api/v1/operations/payment-promises`
- `/api/v1/customers/:id/profile` (the D1 customer detail response has a different shape)
- Local SQLite tenant plan limits, tenant branding settings and local-only migrations.

These need dedicated D1 schema/API implementations plus contract and tenant-isolation tests.

## Database safety

- Hosted production D1 remains the source of truth for the hosted SaaS.
- Local SQLite remains an isolated development/offline runtime; this patch does not sync or import local records.
- No D1 data, migration ledger, secret, Cloudflare Worker deployment or Pages deployment is modified by this branch.
- No full schema snapshot is to be applied to the existing production D1 database.

## Validation

The new `worker/scripts/api-compat.test.js` tests path and method normalization. The GitHub Actions verification workflow runs it and performs Worker syntax, schema validation, backend checks and existing live-safe smoke checks. Merge or production deployment must wait for a green latest-head CI run and a separate review of the unsupported API routes.
