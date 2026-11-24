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

## Verified deployment snapshot — 24 November 2026

- Production Worker `nexus-saas-api`: version 36 deployed at 100% traffic on 2026-11-24; bound to production D1 database `nexus-saas-db`.
- Staging Worker `nexus-saas-api-staging`: version 38 deployed at 100% traffic on 2026-11-24; bound only to staging D1 database `nexus-saas-staging-db`.
- Both Workers have observability logs and traces enabled. The production and staging database bindings were independently checked against their expected database IDs.
- Both D1 databases contain the hosted application tables, including tenant/user, customer, billing, support, sync and network/TR-069 inventory tables.
- The D1 migration ledgers are not identical: production has an additional ID 101 entry, and the recorded name for ID 11 differs between environments. Do not fabricate ledger rows or rerun historical migrations; see the live recheck in [the completion report](docs/COMPLETION-STATUS-2026-11-24.md).
- The production network connector remains disabled. Inventory does not mean a live MikroTik, OLT, ONU or ACS integration is active.
- R2 backup-object verification and an isolated restore drill remain outstanding because the current Cloudflare API session reports that R2 must be enabled before its bucket list can be read.

This snapshot records infrastructure state, **not full ISP production certification**. Complete the Android browser acceptance, real-device/ACS tests, payment-provider setup, independent security review and backup restore drill before relying on NEXUS as the sole system of record for live customers.
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

- Database ownership and SQLite/D1 boundaries: [docs/DATABASE-ARCHITECTURE-RECONCILIATION.md](docs/DATABASE-ARCHITECTURE-RECONCILIATION.md)

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
