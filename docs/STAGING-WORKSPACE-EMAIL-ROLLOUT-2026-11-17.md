# Staging workspace-scoped email rollout — 2026-11-17

## Purpose

NEXUS is multi-tenant. The prior global unique index `idx_users_email_global` prevented the same staff/owner email from being used in separate ISP organizations, despite the API's workspace-aware login behavior. Email uniqueness must be case-insensitive within an organization, not global.

## Code changes

- `worker/src/d1-api-worker.js` accepts `workspace`, `tenantSlug`, or `tenant_slug` on login. The dashboard submits `tenantSlug`.
- Email-only login remains ambiguous when the same email belongs to more than one active workspace and is rejected rather than selecting an arbitrary tenant.
- Migration `0020_allow_workspace_scoped_user_emails.sql` removes only the global unique index. Migration 0019's unique `(organization_id, lower(email))` index remains the tenant-level guard.
- Contract tests cover the dashboard field alias and migration behavior.

## Staging change evidence

- Target: `nexus-saas-staging-db` (`194f62e2-2766-48ab-be17-81248610c0cd`).
- Production database and Worker were not modified.
- Preflight: 177 users; zero duplicate case-insensitive email groups within an organization; global index present; migration 0020 absent.
- A fresh D1-compatible export completed before the change. Export bookmark: `000000b2-00000000-00005126-b3e9c6ed9d5d9a888f38fcc97a3788e5`.
- Applied migration 0020: dropped `idx_users_email_global` and recorded migration ledger ID 20.
- Postflight: global index absent; unique organization-scoped index present; migration 0020 recorded.
- Synthetic test: same email inserted successfully in two separate test organizations; case-variant duplicate in the same organization was rejected by `idx_users_org_email_ci`.
- Synthetic users and organizations were deleted after the test.
- Final counts: 177 users, 178 organizations, 181 customers; zero synthetic E2E rows; `PRAGMA foreign_key_check` returned zero violations.

## Deployment and release boundary

The staging Worker has not yet been redeployed with the updated login alias in this rollout. The migration is therefore schema readiness, not proof that the new login flow is live. Run the contract/CI suite, deploy only the reviewed staging Worker version, then execute HTTP E2E for two workspaces sharing one email and verify ambiguous email-only login is rejected.

Do not apply migration 0020 to production until production login code, registration behavior, rollback/recovery and a separate production release review are approved. Do not merge the divergent development branch automatically.
