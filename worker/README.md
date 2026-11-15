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

- `schema.sql` is a canonical schema snapshot at migration 0009. Use it only for a new, empty D1 database.
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
