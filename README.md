# NEXUS — ISP Management SaaS

**Mobile-first ISP operations platform for FTTH providers.**  
Primary deployment: **Vancom Networks (Pvt) Ltd.**

NEXUS is a multi-tenant ISP management system covering organization/user access, customer records, packages, subscriptions, invoices, payments, refunds, support tickets, customer self-service, notifications and network inventory.

## Environments

| Environment | Frontend | API | Database |
|---|---|---|---|
| Production | https://nexus-isp-management.pages.dev | https://nexus-saas-api.harissaeed030.workers.dev | `nexus-saas-db` |
| Staging | GitHub/Cloudflare preview workflow | https://nexus-saas-api-staging.harissaeed030.workers.dev | `nexus-saas-staging-db` |

The production and staging Workers are separate and each binds only to its matching D1 database. Do not point staging at production data.

## Verified deployment snapshot — 15 November 2026

- Production Worker: `nexus-saas-api`; Cloudflare reports it deployed and active.
- Staging Worker: `nexus-saas-api-staging`; Cloudflare reports it deployed and active.
- Production D1 schema ledger: migrations `0001` through `0007`.
- Staging D1 schema ledger: migrations `0001` through `0007`.
- Migration 0007 adds customer portal accounts and insert/update tenant-consistency triggers.
- Production Worker bindings include D1 (`DB`) and server-side secrets (`JWT_SECRET`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`). Secret values are never stored in this repository.
- Cloudflare's release record reports production Worker version 22 at 100% traffic.
- The production D1 release record reports one organization and one owner, with no customer, invoice, payment or customer-portal-account rows at the time of verification.

This is evidence of deployed infrastructure and schema state, **not certification that every business workflow is production-ready**. Confirm live health, browser flows, backup recovery and tenant isolation before using NEXUS as the sole system of record for real customers.

## Implemented application areas

The Cloudflare Worker source includes:
- Organization registration, authentication, JWT verification, login throttling, logout and token-version invalidation.
- Organization-scoped users, staff roles and permission overrides.
- Customers and customer portal account provisioning.
- Packages, subscriptions, invoices, payments, refunds and billing generation.
- Support tickets, ticket messages, notifications and audit records.
- PPPoE account records, network-device inventory, OLT/ONU inventory and alarm records.
- Customer portal login, profile, dashboard, invoices, payments, subscriptions, tickets and password changes.

The frontend is deployed separately through Cloudflare Pages. The Worker root response is an API landing page; it is not the customer/admin frontend.

## Local SQLite application

The `backend/` directory is a separate local Node.js + SQLite application intended for offline development/testing (including Android Termux). It is not the Cloudflare production D1 database.

Requirements: Node.js 22.13 or newer.

```sh
cd backend
npm install
cp .env.example .env
npm run check
npm test
npm start
```

Open `http://127.0.0.1:4000/`. The local SQLite file is created under `backend/data/`; keep it private and outside Git.

Useful commands from `backend/`:

```sh
npm run verify
npm run db:backup
npm run db:restore -- ./backups/before-upgrade.sqlite
npm run auth:reset -- owner@example.com
```

Stop the local server before restore. Restore validates the backup and keeps a safety backup before replacing the database. Never delete `backend/data/nexus.sqlite` to solve a login issue.

## Cloudflare schema and deployment

- D1 database bindings and migration history: [cloudflare/d1/README.md](cloudflare/d1/README.md)
- Worker environment/configuration: [worker/README.md](worker/README.md)
- Staging Wrangler config: [worker/wrangler.toml](worker/wrangler.toml)
- Production Wrangler config: [worker/wrangler.production.toml](worker/wrangler.production.toml)
- Incremental D1 migrations: [cloudflare/d1/migrations](cloudflare/d1/migrations)
- Production release and backup evidence: [docs/production-release-2026-11-15](docs/production-release-2026-11-15)

Use `worker/schema.sql` only to initialize a new, empty D1 database. For existing databases, apply reviewed incremental migrations only. Before production changes, export/backup D1, verify staging, check the exact Worker/D1 binding and prepare a rollback.

## Network integration — limitations

- RouterOS/MikroTik integration must be considered unverified until a real router connection and safe PPPoE/profile operations are tested against a non-production test account.
- PPPoE account records in the database do not by themselves prove that a router has been provisioned.
- OLT/ONU records and alarms are inventory/application data unless a supported vendor adapter is connected.
- HSGQ-G04R live telemetry and GenieACS/TR-069 device control require verified vendor/ACS endpoints, credentials and end-to-end tests. Do not infer live ONT control from inventory endpoints.
- Never expose router, ACS, WhatsApp, JWT or Cloudflare secrets to browser JavaScript or commit them to Git.

See [backend/MIKROTIK.md](backend/MIKROTIK.md) and the HSGQ integration documentation for supported capabilities and prerequisites.

## Security and operational rules

- Keep tenant scoping enforced server-side; frontend filtering is not an authorization boundary.
- Keep all secrets in Cloudflare Worker secrets or local environment variables.
- Use HTTPS, least-privilege staff permissions, rate limiting and validated input.
- Preserve production customer/financial records; use additive migrations and verified backups.
- Do not deploy staging configuration against production or run a full schema snapshot over an existing database.

## Verification

The repository includes GitHub Actions for backend checks, Worker source checks, D1 schema validation, live endpoint smoke checks and staging customer-portal/tenant-isolation tests. Check the latest run for the exact commit being released; a passing run on a different branch or SHA is not evidence for the current `main` commit.

## License

All rights reserved until a license is added. Do not assume the project is open source for reuse or resale.
