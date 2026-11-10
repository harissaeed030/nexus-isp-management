# NEXUS SaaS — Zero-budget rollout

## Architecture decision

- Keep the existing Express + SQLite local app intact.
- Build the cloud SaaS API separately under `cloudflare/` on branch `saas/cloudflare-foundation`.
- Cloud target: Cloudflare Workers + D1 + Workers Static Assets.
- No paid plan, payment card, live migration, or deployment is required for local development.
- Never store ISP router, OLT, ONU, ACS or payment credentials in browser code.

## Phase 1: SaaS foundation

This branch adds:
- D1 schema for tenants, users, sessions, plans and tenant subscriptions.
- Worker API for health, tenant registration, login, current-user lookup and logout.
- Password hashes using PBKDF2-HMAC-SHA256 and random salts.
- Random bearer tokens; only SHA-256 token hashes are stored in D1.
- 14-day trial subscription record on registration.
- Globally unique login email to avoid ambiguous tenant selection.

## Deploy setup (only after reviewing and testing)

1. Create or sign in to a Cloudflare Free account: https://dash.cloudflare.com/sign-up
2. In Termux, install Node.js 22 or newer and Wrangler:
   `npm install --global wrangler`
3. Authenticate Wrangler:
   `npx wrangler login`
4. From the repository's `cloudflare` directory create D1:
   `npx wrangler d1 create nexus-saas-db`
5. Copy the returned database ID into `cloudflare/wrangler.toml`, replacing the placeholder.
6. Apply the migration:
   `npx wrangler d1 migrations apply nexus-saas-db --remote`
7. Run local preview first:
   `npx wrangler dev`
8. Only after local checks, deploy manually:
   `npx wrangler deploy`

Do not deploy until the database ID is configured and the security checklist is reviewed.

## Initial API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)
- `POST /api/auth/logout` (Bearer token)

Registration requires companyName, fullName, email and a password of at least 12 characters.

## Important limitations — not production-ready yet

- Registration currently has no email verification, CAPTCHA/Turnstile, or distributed rate limiter.
- No password reset or email delivery yet.
- No Super Admin UI or protected Super Admin provisioning flow yet.
- No tenant-scoped customer/package/billing routes have been migrated yet.
- No subscription payment gateway is connected; plan prices are placeholders.
- No production backup/restore automation or monitoring policy has been completed.
- CORS currently permits browser origins; tighten this to the deployed application origin before public launch.
- The 14-day trial and Basic/Professional prices are proposed defaults, not a final commercial offer.
- This foundation is a development milestone only. Do not onboard real ISPs or store production customer records until the missing controls and tests are complete.

## Go-live gates

- Automated tests for registration, login, logout, expired sessions and tenant isolation.
- Rate limiting and abuse protection.
- Email verification and secure password recovery.
- Super Admin access control and audit trail.
- Tenant-scoped CRUD for ISP modules.
- Production database backup and restore drill.
- HTTPS, origin restrictions, security review and monitoring.
- User acceptance testing with non-production sample data.
