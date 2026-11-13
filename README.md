# NEXUS — ISP Management SaaS

**Mobile-first, multi-tenant ISP operations platform for FTTH providers.**

## Active architecture

The selected SaaS backend is **Cloudflare Workers + Cloudflare D1**.

- Production API: `https://nexus-saas-api.harissaeed030.workers.dev`
- Production Pages branch: `dev`
- Active implementation branch: `cloudflare/complete-saas`
- Cloudflare Pages production and Worker deployments are kept separate from feature development.
- The `backend/` Node.js + SQLite project is retained as an offline/local development foundation; it is not the active hosted SaaS API.

## Development preview

The current isolated implementation preview is:

https://3ebc8485.nexus-isp-management.pages.dev

Do not merge the implementation branch into `dev` or deploy the Worker until the owner reviews the changes and approves the deployment/migration sequence.

## Current status

Core customer, package, subscription, billing, complaint, staff, dashboard and network inventory foundations exist. The active development branch is integrating them with the Cloudflare API and completing missing modules.

Implemented work and the remaining development backlog are tracked in:

- [Cloudflare implementation status](docs/CLOUDFLARE-IMPLEMENTATION-STATUS.md)
- [Development progress](docs/PROGRESS.md)

The software is **not yet complete or production-ready**. Real MikroTik, HSGQ OLT and GenieACS operations, customer self-service, scheduled billing, PDF invoices, notifications, SaaS tenant administration and comprehensive final testing remain outstanding.

## Basic development checks

GitHub Actions checks syntax for:
- `worker/src/index.js`
- `assets/js/app.js`

These checks do not replace integration or acceptance testing.

## Safety rules

- Never commit API secrets, JWT secrets, router passwords, customer records or database files.
- Keep network credentials server-side and encrypted.
- Preserve tenant scoping on every API and database query.
- Do not apply production D1 migrations or deploy the Worker without reviewing the migration and rollback plan.
- Keep the final comprehensive testing phase until all planned modules are implemented.
