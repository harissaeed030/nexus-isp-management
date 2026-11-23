# NEXUS Cloudflare Worker

## Deployed environments

| Environment | Worker | D1 database |
|---|---|---|
| Production | `nexus-saas-api` | `nexus-saas-db` |
| Staging | `nexus-saas-api-staging` | `nexus-saas-staging-db` |

The production Worker is built from `src/production-worker.js`; staging is built from `src/index.js`. They share the same verified API and customer-portal implementation. The production bundle deliberately omits the staging-only synthetic-tenant cleanup endpoint.

## Implemented API areas

- ISP organization registration and owner authentication
- JWT validation, password hashing, login throttling, logout/token-version invalidation
- Tenant-scoped users, permissions, customers and customer portal accounts
- Packages, subscriptions, invoices, payments, refunds and billing generation
- Support tickets, ticket messages, notifications and audit log
- PPPoE accounts and network inventory
- OLT/ONU inventory, alarms, service mapping and adapter capability reporting
- Customer portal login, profile, dashboard, invoices, payments, subscriptions, tickets and password changes

The RouterOS and HSGQ adapters must be treated according to their documented capabilities. A configured inventory record is not proof of a live router/OLT connection. See `docs/HSGQ-G04R-INTEGRATION.md` for the current HSGQ limitation and required vendor documentation.

## Configuration and secrets

- Production D1 binding: `DB` -> `nexus-saas-db`
- Staging D1 binding: `DB` -> `nexus-saas-staging-db`
- Secret bindings: `JWT_SECRET`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`
- Never put secret values in source files, Wrangler vars, frontend code or GitHub commits.

## Schema

- `schema.sql` is the canonical full schema snapshot, including source migrations 0022–0023. Use it only for a new, empty D1 database. Use it only for a new, empty D1 database.
- Existing production/staging databases must use incremental migrations under `cloudflare/d1/migrations/`.
- Do not run the full schema snapshot over an existing database.
- See `cloudflare/d1/README.md` for migration history and release notes.

## Local deployment commands

Run from the `worker/` directory after authenticating Wrangler and verifying the target account:

```sh
npx wrangler deploy --config wrangler.toml
npx wrangler deploy --config wrangler.production.toml
```

The first command targets staging; the second targets production. Before any production deployment, verify the production D1 backup, migration state, inherited bindings and staging E2E checks. Never use a staging config against production data.


## Staging security deployment — 2026-11-15

Staging Worker version `d79d6f84-62eb-4339-8dbd-927a4aa109a1` was uploaded and deployed at 100% traffic after the logging-redaction source checks passed. The upload preserved the existing `DB` D1 binding and the `ALLOWED_ORIGINS`, `JWT_SECRET`, and `TURNSTILE_SECRET_KEY` secret bindings. Production Worker deployment is kept separate and must follow staging live-smoke verification.

Production Worker version `7f85ed27-e3bc-47bd-9ebc-24a6a0e04dfb` was deployed at 100% traffic after staging version `d79d6f84-62eb-4339-8dbd-927a4aa109a1` passed live endpoint smoke verification and tenant-isolation E2E. The production upload preserved its existing `DB` D1 binding and `ALLOWED_ORIGINS`, `JWT_SECRET`, and `TURNSTILE_SECRET_KEY` secret bindings. The change only redacts organization identifiers and raw exception text from application error logs; it does not alter API routes or database records.
