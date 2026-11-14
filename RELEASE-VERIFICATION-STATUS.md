# NEXUS Release Verification Status

**Release line:** `release/v1.0.0-rc1`  
**Reviewed commit before this record:** `b8f0e38da5d3693b8cea1cc5d670de0fdd4eb226`  
**Decision:** NOT READY — verification remains incomplete.

## Verified automated checks

The release-candidate CI evidence previously inspected includes the following checks on the Node.js + SQLite release candidate:

- Node.js runtime setup and dependency installation.
- JavaScript syntax checks.
- Backend smoke tests for setup/authentication, customer/package/subscription CRUD, router inventory, monthly billing, staff permissions, and role-based access.
- Security tests for cross-tenant record isolation, tenant-scoped exports, authentication throttling, baseline security headers, and production environment guards.

These are evidence for the specific release-candidate commit and workflow run only. They do not certify the Cloudflare Worker/D1 track or an integrated SaaS release.

## Required checks still outstanding

- [ ] Select and approve one canonical production runtime and deployment target.
- [ ] Reconcile frontend API paths with the selected backend contract.
- [ ] Resolve duplicate SQLite migration versions with an upgrade-safe ledger strategy.
- [ ] Test fresh database installation and upgrades on disposable database copies.
- [ ] Run complete route-by-route authorization and tenant-isolation coverage on the integrated commit.
- [ ] Verify invoice, payment, refund, duplicate-payment, and billing-period behavior end to end.
- [ ] Complete customer portal and admin frontend end-to-end testing.
- [ ] Complete Android Chrome responsive and workflow testing.
- [ ] Verify Cloudflare Worker/D1 bindings, migrations, CORS, and live API behavior if Worker/D1 is selected.
- [ ] Complete independent security review, including login identity semantics, session/token storage, XSS, CSRF, SQL injection, and relational tenant constraints.
- [ ] Perform encrypted backup, restore, and rollback drills.
- [ ] Verify production HTTPS, secrets configuration, monitoring, alerting, and deployment rollback.

## Safety constraints

- Do not merge dirty or incompatible pull requests.
- Do not run migrations against production or customer databases during verification.
- Use disposable copies for migration, backup, restore, and destructive tests.
- Do not expose secret values in logs, reports, or commits.
- Do not describe external hardware, payment, SMS, WhatsApp, or email integrations as operational without live evidence.

## Release gate

The release may be marked **PRODUCTION READY** only after every mandatory item above is verified on the exact integrated release commit and the final release PR has passed its required checks and human approval.

Until then, the correct release status is **NOT READY**.
