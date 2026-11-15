# NEXUS Security Audit

**Date:** 2026-11-15  
**Scope:** Cloudflare Worker settings, D1 schema metadata, release documentation and selected production Worker/frontend source.

## Verified controls
- Production and staging are separate Worker scripts.
- Production Worker D1 binding points to `nexus-saas-db`; staging points to `nexus-saas-staging-db`.
- Worker settings list secret bindings: `JWT_SECRET`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`. Secret values were not accessed.
- Worker source contains HS256 JWT signing/verification and expiry validation.
- Worker source contains PBKDF2-SHA256 password hashing (100,000 iterations) for the reviewed production portal path.
- Production Worker source includes security response headers and CORS handling.
- Release documentation reports live smoke coverage for CORS preflight, unauthenticated API guards, security headers and JWT expiry.
- D1 has organization-scoped indexes and tenant-integrity triggers; migration 0006/0007 are recorded in production and staging.
- Refund idempotency/reference indexes are unique and scoped by organization.
- Production Worker release is documented at 100% traffic.

## Not independently certified
- Exhaustive authorization testing for every route and every role.
- Complete SQL injection review of all dynamic query construction.
- CSV formula-injection handling across every export path.
- Rate-limit thresholds and brute-force lockout under live load.
- Encryption-at-rest implementation and key rotation for RouterOS credentials.
- Full audit-log coverage for every privileged mutation.
- Live D1 `PRAGMA integrity_check` / `foreign_key_check`: the D1 query endpoint returned `SQLITE_AUTH` for PRAGMA.
- Fresh public network health probe during this session: outbound DNS/network access was unavailable.

## Required remediation / acceptance
1. Run the full route/role authorization matrix using two separate tenants.
2. Add automated negative tests for cross-tenant reads, writes, customer portal access and staff permissions.
3. Confirm password hashing and session revocation behavior for admin and portal authentication separately.
4. Verify login attempt throttling and rate limits with deterministic clock-controlled tests.
5. Verify all CSV exports neutralize formula-leading cells (including `=`, `+`, `-`, `@`, tabs and carriage returns).
6. Confirm router credentials are encrypted server-side, never returned by API, and keys are not stored in the browser.
7. Verify payment/refund idempotency under concurrent duplicate requests.
8. Review CORS allowlist against actual production domains; do not use wildcard origins with credentials.
9. Complete D1 consistency and backup-restore rehearsal through a supported Cloudflare method.

**Status:** Security controls exist, but the full independent security certification remains open. Do not label the whole SaaS security-certified.
