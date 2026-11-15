# NEXUS ISP Management audit — 2026-11-15

## Scope and evidence

This audit reviewed the repository tree and code reachable on `build/nexus-isp-core`, the backend package scripts, the SQLite migration registry and migrations, backend route/auth/permission code, dashboard API usage, customer portal routes, backup/restore test coverage, recent branch commits, workflow results, and the repository's open release-related pull requests.

The audited branch head observed was `e07ca307bd2defa90dc6aa012c50ac1817fc03bb`. The latest two branch workflows observed for that SHA both concluded successfully:

- [Nexus backend verification](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43658402168)
- [Nexus backend checks](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43658402174)

This GitHub-only environment cannot execute `npm install`, `npm run check`, or `npm test` locally, inspect a local worktree's uncommitted files, test against a real deployment/database, or perform a mobile-device/security review. The workflow status is real remote CI evidence, not a claim that those commands were run in this session.

## What is present on the audited branch

- Node.js backend using the built-in SQLite driver and a local SQLite database. `backend/package.json` defines `check`, `test`, `verify`, backup, and restore scripts; the documented Node requirement is 22.13 or newer.
- API modules for authentication, tenant-scoped customers and subscriptions, packages, billing and financial records, support, staff/RBAC, router and fiber inventory, TR-069/ACS, customer portal, and notifications.
- Versioned database migrations through `009_session_hardening`; a migration reconciliation test checks additive changes and restart safety.
- Test scripts for smoke/business flows, migration and database hardening, adapter behavior, and portal/notifications. The smoke coverage includes transactional rollback, tenant scoping, billing, and staff permission cases.
- A dashboard and customer portal served by the backend, plus responsive frontend assets.
- SQLite backup/restore utilities and tests, with integrity validation and preservation of a pre-restore safety copy.

## Findings and blockers

1. **Production architecture is not release-ready.** The audited branch's documented runtime is local SQLite. The separate `worker/` implementation explicitly describes itself as a foundation and says login, tenant authorization, CRUD validation, rate limiting, and audit events are not enabled there. Do not treat the Worker/D1 path as equivalent to the local API or deploy it as a production substitute without a separately verified implementation and migration plan.
2. **No production approval.** The repository's open release-gate/candidate work remains draft and itself records outstanding verification. This audit did not establish independent security review, production data-store/Worker provenance, production HTTPS-edge behavior, a full browser/mobile acceptance run, or a full backup/restore rehearsal against the intended production topology.
3. **Recurring unattended billing is not proven complete on this branch.** The branch contains manual monthly invoice generation and idempotency tests. The scheduled recurring billing/Cron Trigger work is in a separate open draft change and was not part of this branch's verified source.
4. **Tenant-scoped staff-email correction is pending separately.** Open PR #33 concerns the Worker/D1 schema and does not by itself establish or change the audited SQLite branch's email-identity semantics. It has not been merged or applied by this audit.
5. **Current live/staging state was not tested.** No production or Cloudflare resources were accessed or changed, as required. No external gateway, payment provider, router, OLT, ACS, or WhatsApp credentials/integrations were exercised.
6. **Local package commands could not be run here.** `npm install`, `npm run check`, and `npm test` were not executed in this session; use the two successful branch workflow runs above as CI evidence, and rerun the documented commands in a trusted Node 22.13+ checkout before release.
7. **Repository API cannot verify local uncommitted work.** This report only documents the committed remote branch content available through GitHub. No claim is made about a developer's local changes.

## Actions taken

- Preserved the requested branch and made no changes to application behavior, migrations, secrets, database files, backups, Cloudflare resources, or deployment configuration.
- Added this audit report as a documentation-only change. No production deployment was performed.

## Release decision

**NO-GO for production.** The successful CI runs are encouraging but do not close the architecture, deployment, independent security, real-environment restore, external integration, and mobile/browser verification gates above. Reassess after those gates have documented evidence and the intended production architecture is verified end to end.
