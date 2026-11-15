# Production Worker Security Hardening

**Target:** `dev` branch / production Worker source  
**Status:** patch prepared; not deployed to production

## Findings and changes

1. **JWT expiration:** the previous verifier accepted a correctly signed token when `exp` was absent. Verification now requires a safe-integer expiration timestamp strictly in the future. Existing Worker token issuers use millisecond timestamps.
2. **CORS:** the previous code treated an empty `ALLOWED_ORIGINS` value as permission for every Origin. CORS now returns an allow-origin header only for an exact configured origin.
3. **Audit observability:** audit insert failures were silently discarded. They are now logged server-side with action and organization context, without returning audit details to clients. This is alerting/visibility, not fail-closed transactional auditing; critical financial actions still need a separately reviewed atomic-audit design.
4. **Initial role:** the first registrant is now stored and returned as `owner`, including the signed JWT.
5. **Dashboard startup:** corrected the malformed API URL validation regular expression so the dashboard script parses.

## Required release checks

- Verify the production `ALLOWED_ORIGINS` secret is populated with exact approved origins; its value was not read or changed.
- Run the new GitHub Actions Worker syntax workflow.
- Exercise login, token expiry, CORS allow/deny, owner-only staff management and audit-write failure behavior on staging.
- Complete an independent security review before production deployment.

No production Worker, D1 database, secret value or customer record was changed by this branch.
