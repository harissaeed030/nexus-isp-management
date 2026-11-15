# Nexus Cloudflare Worker — repository scope

The `worker/` directory on this development branch is a minimal Cloudflare Worker/D1 health-check foundation. Its current source exposes `GET /api/health` and `OPTIONS`; it does **not** implement the full local Node.js API contract or the full ISP-management module set.

The maintained local development runtime is `backend/` (Node.js + SQLite). Its setup and test instructions are in [Backend setup](../docs/BACKEND-SETUP.md).

## Health endpoint

Configure the D1 binding in `wrangler.toml` for a disposable development database, then deploy only when the target Worker and database have been explicitly reviewed. The health route is:

```
GET /api/health
```

It reports Worker status and whether the configured D1 binding can execute a simple query. It is not an authentication or business API readiness check.

## Important production boundary

The repository's `main` branch contains the separately released Cloudflare customer-portal Worker path. The production release record is documented in [Production release 2026-11-15](../docs/PRODUCTION-RELEASE-2026-11-15.md). Do not deploy this branch's minimal `worker/` directory over the production Worker: it is not a replacement for the released Worker source.

The SQLite migrations under `backend/migrations/` are not D1 migrations. Never apply them to a Cloudflare D1 database. Use additive D1 migrations and the documented release procedure for the Cloudflare runtime.

## Security

- Keep D1 bindings and Worker secrets in Cloudflare configuration, never in source control.
- Restrict CORS to exact approved origins.
- Do not add real customer records to this health-only Worker foundation.
- Do not expose router, OLT or ACS credentials to browser JavaScript.
- Verify the deployment target, Worker source, D1 binding and current production backup before any production change.