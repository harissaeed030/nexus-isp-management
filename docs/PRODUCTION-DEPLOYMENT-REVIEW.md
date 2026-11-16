# NEXUS Cloudflare D1 production deployment review

**Review date:** 2026-11-16  
**Decision:** Staging verified; no production deployment performed or required for the D1 API source in this task.

## Staging deployment

- Worker: `nexus-saas-api-staging`
- URL: `https://nexus-saas-api-staging.harissaeed030.workers.dev`
- D1 binding: `DB` → `nexus-saas-staging-db`
- API source: aligned to the currently deployed production Worker source; the deployed source bodies match apart from the trailing newline.
- Existing staging bindings preserved during upload: `JWT_SECRET`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`, and `DB`.
- Secret values were not read or written into Git. Existing secret values were retained; the smoke tests confirm that JWT authentication works and the Pages origin passes CORS.

A full D1 export of the staging database completed before the API request triggered its additive runtime schema checks.

## Live staging verification

The GitHub Actions workflow `D1 staging API smoke tests` completed successfully on 2026-11-16.

Verified against the live staging Worker:

1. `GET /api/health` reports a healthy D1 binding.
2. Pages CORS preflight for `https://nexus-isp-management.pages.dev`.
3. Organization registration, owner login, and `/api/auth/me`.
4. Customer, package, and subscription creation.
5. Monthly billing generation.
6. Invoice creation, payment collection, and invoice settlement.
7. Customer, invoice, and payment list APIs.
8. Cross-tenant customer isolation (another tenant receives 404) and unauthenticated access rejection (401).

Two synthetic smoke-test organizations and their test customer/package/subscription/invoice/payment records remain in staging from the final run. They contain no real customer data. Do not run the manual smoke workflow repeatedly without planning cleanup.

## Production resources reviewed (read-only)

- Production Worker remains `nexus-saas-api`.
- Its `DB` binding still points to `nexus-saas-db`.
- Production Worker secrets are present by binding name: `JWT_SECRET`, `ALLOWED_ORIGINS`, and `TURNSTILE_SECRET_KEY`.
- Production D1 migration ledger contains migrations 0001–0010 plus the separate `sync_ledger_and_failures_tables` record.
- Production D1 contains the sync mapping/operation tables, but the branch's `0011_sqlite_sync_inbox.sql` is not represented by a numbered migration record. That migration is outside the API smoke path; reconcile the sync migration history before further production sync-schema changes.
- Production D1 has both `idx_users_email_global` and `idx_users_org_email_ci`. Migration 0009 explicitly creates the global unique email index, so the current production policy requires email addresses to be globally unique across organizations. Workspace slug is still used during login.

No production Worker setting, secret, D1 schema, or production data was changed during this review.

## Production decision

The API source currently deployed to production is already the source now mirrored in staging. Therefore, redeploying the same API code to production would provide no code change and was not performed.

The wider draft PR #59 remains unmerged. Do not promote the rest of that branch to production until its complete diff, migrations, frontend integration, and release acceptance have been reviewed independently.
