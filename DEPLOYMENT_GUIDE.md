# NEXUS Deployment Guide

## Production URLs
- Frontend: https://nexus-isp-management.pages.dev
- Customer portal: https://nexus-isp-management.pages.dev/portal/
- API: https://nexus-saas-api.harissaeed030.workers.dev

## Staging
- API: https://nexus-saas-api-staging.harissaeed030.workers.dev
- D1: `nexus-saas-staging-db`

## Git and Pages
Cloudflare Pages project: `nexus-isp-management`  
GitHub repository: `harissaeed030/nexus-isp-management`  
Production branch: `main`

The project currently serves root static assets: Pages build command, root directory and output directory are blank. Do not add a framework build command unless the frontend layout is changed and a verified build is added. Branches other than `main` are previews.

## Worker deployment configs
From `worker/`:
- Staging: `npx wrangler deploy --config wrangler.toml`
- Production: `npx wrangler deploy --config wrangler.production.toml`

Before production deployment:
1. Confirm the target Cloudflare account.
2. Review the exact diff and test the same commit in staging.
3. Confirm `DB` is bound to the production D1 UUID only for production config.
4. Confirm `JWT_SECRET`, `ALLOWED_ORIGINS` and `TURNSTILE_SECRET_KEY` remain secret bindings.
5. Export/backup D1 before any schema change.
6. Apply additive, idempotent migration files only.
7. Run live smoke tests, then deploy.
8. Verify Worker deployment version and traffic allocation.

Never run `worker/schema.sql` against an existing database. It is a fresh-database snapshot. Use incremental migrations in `cloudflare/d1/migrations/`.

## Database identifiers
- Production: `ce88098b-bff4-4d06-a0df-7bf29622a085`
- Staging: `194f62e2-2766-48ab-be17-81248610c0cd`

## Smoke verification
The repository workflow `.github/workflows/live-smoke.yml` checks production and staging health, D1 readiness, CORS preflight, unauthenticated route guards, security headers, Pages HTML and customer portal route. Run it after every production release and retain the run URL in the release record.

## Frontend API environment
The customer portal browser code currently falls back to the production Worker URL. Pages project API environment variables are currently empty. Before using Pages preview deployments for staging portal acceptance, add a tested runtime/build-time API-base configuration so preview deployments target staging and production targets production. Do not put secrets in browser configuration.

## Local backend
The repository also contains a Node/SQLite local backend. Its role is not yet fully reconciled with the production Worker/D1 deployment. Follow the backend README for local development only until the architecture is unified.
