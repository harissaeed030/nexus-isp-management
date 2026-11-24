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
- Secret bindings: `JWT_SECRET`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`, `OPENAI_API_KEY` (server-side only)
- Never put secret values in source files, Wrangler vars, frontend code or GitHub commits.


## NEXUS AI assistant

- Authenticated endpoint: `POST /api/ai/chat`.
- Uses the OpenAI Responses API with `gpt-6-luna`; the API key is read only from the Worker secret `OPENAI_API_KEY`.
- Chat history is limited to 12 alternating messages and 10,000 total characters. The checked-in production Worker source reserves a maximum of 5 AI attempts per user per organization in a rolling one-minute window using one atomic D1 `INSERT ... SELECT` statement, so failed upstream attempts count and concurrent Worker isolates share the limit. This source change is committed but is not yet deployed to the live Worker; the currently deployed `nexus-saas-api` has its separate in-memory 10/minute guard.
- The browser never receives the OpenAI API key. The assistant does not access or mutate customer, billing, router or ONU records.
- Never add API key values to Git, Wrangler configuration, logs, or frontend code.


## Hosted owner/staff password recovery

The staging and production Worker source includes an opt-in, email-delivered password recovery flow:
- Request: \`POST /api/v1/auth/password-reset/request\` with \`email\` and optional \`workspaceSlug\`.
- Consume: \`POST /api/v1/auth/reset-password\` with the emailed \`token\` and a new password (10–256 characters).
- Public request responses are identical for existing and unknown accounts; requests and token consumption are throttled by source IP and normalized email.
- Tokens are cryptographically random, valid for 30 minutes, single-use, and stored only as SHA-256 digests in the existing \`password_resets.token\` column. The raw token is delivered only by email in the URL fragment (\`#reset=...\`).
- A successful reset atomically consumes the token, updates the PBKDF2 password hash/salt, increments \`users.token_version\` to invalidate existing sessions, and records an audit event.
- If email delivery fails, the pending token is invalidated. Provider errors and bearer tokens are not returned to callers or logged.

Before the feature can send mail, configure these Worker secrets in the intended environment:
- \`RESEND_API_KEY\`: Resend API key.
- \`PASSWORD_RESET_FROM\`: sender address verified by Resend.
- \`PASSWORD_RESET_URL\`: HTTPS URL of the NEXUS login page.

For staging, use \`wrangler.toml\`; for production, use \`wrangler.production.toml\`. Example commands (run one at a time after confirming the target account):
\`\`\`sh
npx wrangler secret put RESEND_API_KEY --config wrangler.toml
npx wrangler secret put PASSWORD_RESET_FROM --config wrangler.toml
npx wrangler secret put PASSWORD_RESET_URL --config wrangler.toml
\`\`\`
The production config filename may be substituted for staging only after explicit target verification. Never place secret values in Wrangler files, source code, browser code, or Git. If any setting is absent, the endpoint returns a generic response and sends no email. This PR does not deploy either Worker, change D1 data, or set any secrets.

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


## Staging security deployment — 2026-11-15

Staging Worker version `d79d6f84-62eb-4339-8dbd-927a4aa109a1` was uploaded and deployed at 100% traffic after the logging-redaction source checks passed. The upload preserved the existing `DB` D1 binding and the `ALLOWED_ORIGINS`, `JWT_SECRET`, and `TURNSTILE_SECRET_KEY` secret bindings. Production Worker deployment is kept separate and must follow staging live-smoke verification.

Production Worker version `7f85ed27-e3bc-47bd-9ebc-24a6a0e04dfb` was deployed at 100% traffic after staging version `d79d6f84-62eb-4339-8dbd-927a4aa109a1` passed live endpoint smoke verification and tenant-isolation E2E. The production upload preserved its existing `DB` D1 binding and `ALLOWED_ORIGINS`, `JWT_SECRET`, and `TURNSTILE_SECRET_KEY` secret bindings. The change only redacts organization identifiers and raw exception text from application error logs; it does not alter API routes or database records.

## Production deployment — 2026-11-23 (Worker version 34)

- Source: `worker/src/production-worker.js` from GitHub main commit `13c7d0cedb451a9fdb75575aaed632f5da71ced0`.
- Cloudflare Worker: `nexus-saas-api`; deployed version `70e8f0a5-c29c-4d06-802d-ea27a3f9b4b9` at 100% traffic.
- The upload inherited the existing production bindings, including the D1 binding and all secret bindings; no secret values were read, replaced, or committed.
- Existing production D1 database `nexus-saas-db` remains bound. Worker migrations are additive/idempotent and execute on the first API request in each isolate.
- Rollback target immediately before this release: version `ed46dad1-3775-4678-ab75-fff91ed3fada` (version 33).
- Version preview URLs were disabled again after release verification setup.
