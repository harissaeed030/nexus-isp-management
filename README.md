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

## Release status — 27 November 2026

**CONDITIONAL GO — HOSTED CORE ONLY.** NEXUS is deployed for controlled evaluation/pilot use; this is not full ISP production certification. Backup restore, schema-history reconciliation, production email sender configuration, independent security review, Android acceptance, payment-gateway verification, and live MikroTik/OLT/ONU/TR-069 lab tests remain outstanding. Keep `NETWORK_CONNECTOR_ENABLED=false`. Do not rely on NEXUS as the sole live billing/system-of-record until those gates pass.

## Verified deployment snapshot — 27 November 2026

- Production Worker `nexus-saas-api` is present and bound to production D1 database `nexus-saas-db` (version/traffic state should be rechecked before the next release).
- Staging Worker `nexus-saas-api-staging` is present and bound only to staging D1 database `nexus-saas-staging-db` (version/traffic state should be rechecked before the next release).
- Existing Worker secret-text, D1 and plain-text bindings were preserved through both code deployments. Logs and traces remain enabled.
- Hosted owner/staff password recovery (PR #109) and the follow-up rate-limit isolation fix (PR #112) are merged and deployed to both Workers. Password-reset email delivery remains disabled until a valid Resend API key and verified sender address are configured; no secrets are stored in Git.
- Cloudflare Pages production deployment for the latest code and documentation updates is successful.
- Production and staging D1 migration ledgers and some table/index definitions are not identical. The staging users password-hash triggers are a documented compatibility mechanism for its older nullable column; do not rebuild tables or fabricate ledger rows. See [the completion report](docs/COMPLETION-STATUS-2026-11-24.md) for the read-only comparison.
- The production network connector remains disabled. Inventory does not mean a live MikroTik, OLT, ONU or ACS integration is active.
- R2 backup-object verification and an isolated restore drill remain outstanding because R2 is not enabled for this account/API session.

This snapshot records hosted deployment state, **not full ISP production certification**. Real-device/ACS tests, payment-provider setup, Android owner/staff/customer acceptance, independent security review, schema-parity review and the backup restore drill remain release gates before relying on NEXUS as the sole system of record for live customers.
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
