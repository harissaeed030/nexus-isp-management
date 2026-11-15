# Nexus architecture

## 1. Product boundary

Nexus is a multi-tenant ISP operations platform. An ISP tenant manages its own staff, customers, packages, subscriptions, invoices, payments, support cases and network inventory. Platform-level tenant administration is a separate concern from tenant-owned business records.

## 2. Maintained local runtime

The Android/Termux and desktop development runtime is:

`Browser → Node.js/Express API → SQLite`

- API and authentication: `backend/src/`.
- Local database and additive SQLite migrations: `backend/src/config/database.js` and `backend/migrations/`.
- Dashboard assets: `assets/`.
- Local database default: `backend/data/nexus.sqlite`.

The API derives tenant scope from the authenticated user. Every tenant-owned route must apply server-side tenant filtering and authorization; a tenant identifier supplied by the browser is never sufficient authorization.

## 3. Cloudflare runtime boundary

The repository also contains a Cloudflare Worker/D1 track. On this development branch, `worker/src/index.js` is only a health-check foundation. The separately released customer-portal Worker path is recorded in [the 2026-11-15 production release note](PRODUCTION-RELEASE-2026-11-15.md).

These are distinct runtimes and schemas:

- SQLite migrations in `backend/migrations/` must never be applied to D1.
- The minimal Worker in this branch must not be deployed over the released production Worker.
- Frontend API base URLs, authentication contracts, response shapes and CORS must be verified for the selected runtime before deployment.

A unified single-backend deployment architecture remains a release decision; do not claim that the local SQLite API and production Worker/D1 are already interchangeable.

## 4. Domain modules

- Identity: users, roles, permissions and sessions.
- Tenancy: ISP organizations and tenant settings.
- CRM: customers, contacts, addresses, service locations and coverage areas.
- Catalog and provisioning: packages, subscriptions, service lifecycle and router profiles.
- Finance: invoices, payments, ledgers, credits, reversals and outstanding balances.
- Network: routers, OLTs, PON ports, ONUs/ONTs and customer service mappings.
- ACS: GenieACS device inventory, parameter reads and approved actions.
- Support: complaints, tickets and status history.
- Operations: connection applications, technicians, dealers, collections, payment promises and stock movements.
- Audit: actor, tenant, action, target and timestamp.

## 5. Integration design

`Browser → Nexus API → Integration adapter → vendor/service`

The browser must never communicate directly with routers, OLTs or ACS using privileged credentials. Adapters require timeouts, input validation, authorization, redacted logs and safe error handling. Begin with read-only device operations; enable provisioning only after device-specific acceptance testing and an explicit operator action.

## 6. Security baseline

- Password hashing with a modern password-hashing algorithm.
- Hashed bearer-session tokens and bounded expiry.
- Role-based access control and tenant scoping on every protected endpoint.
- Rate limiting, request validation and safe error responses.
- Secrets in environment variables or a managed secret store.
- Redacted logs; never log passwords, tokens or full customer secrets.
- HTTPS, private database storage, backups and restore tests.

## 7. Release and verification boundaries

A code module being present does not certify production readiness. Separate evidence is required for:

1. Automated syntax, unit, integration and smoke tests.
2. Tenant-isolation and independent security review.
3. Persistent hosting, HTTPS, secrets, firewall and monitoring.
4. Backup/restore rehearsal on a disposable copy of the intended database.
5. Android/browser acceptance.
6. Live MikroTik RouterOS API-SSL acceptance.
7. Vendor-verified HSGQ OLT/ONU communication and telemetry.
8. Live GenieACS/TR-069 ONU inform and approved task verification.
9. Payment-provider and scheduled billing acceptance.

No live hardware or external service integration is considered successful solely because an adapter test passes.