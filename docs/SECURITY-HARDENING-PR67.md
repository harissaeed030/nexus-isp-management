# PR #67 security hardening

- New passwords use versioned PBKDF2-HMAC-SHA256 at 600,000 iterations. Existing salted 100,000-iteration owner/staff and customer-portal hashes remain verifiable and upgrade after successful login. Missing/malformed salts fail closed; plaintext fallback is removed. New passwords are limited to 8–128 characters.
- Production JSON API responses set Cache-Control: no-store and Pragma: no-cache.
- Registration is throttled to 5 attempts per IP and 3 per normalized email per 15 minutes. This does not replace Cloudflare edge rate limiting or verified-email onboarding.
- New PPPoE ciphertext uses the separate PPPOE_ENCRYPTION_KEY secret (minimum 32 bytes) and enc:v2. Existing enc:v1 values remain decryptable with the original JWT_SECRET HKDF derivation. Keep JWT_SECRET until legacy v1 records are re-encrypted through a separately reviewed process.
- SQLite triggers reject payment promises with cross-tenant customer/creator IDs on insert and update.

## Migration numbering correction — 2026-11-17

The live staging and production D1 databases have already used migration ID 13 for `0013_subscription_workspace_status`. This security migration therefore uses **ID 14** and the file `cloudflare/d1/migrations/0014_security_hardening.sql`. Never apply the former `0013_security_hardening.sql` file or reuse migration ID 13. The migration writes its own `schema_migrations` record for ID 14. Its regression test runs the SQL twice and verifies idempotency, the migration ledger, and cross-tenant insert/update rejection.

## Release gates
1. Apply migration 0014 only after an approved staging D1 preflight and verified backup. This source change does not apply the migration.
2. Run Cloudflare workerd password-hash profiling and staging E2E before deployment. 600,000 PBKDF2-HMAC-SHA256 iterations follows OWASP guidance where PBKDF2/FIPS is required; measured Worker latency/load remains a release gate.
3. Verified-email/invite onboarding and Cloudflare edge rate limiting remain separate release gates. Account currently has no zones, so zone-level rate limiting cannot be configured.
4. Review key rotation and legacy PPPoE v1 re-encryption before production.
5. Configure PPPOE_ENCRYPTION_KEY only through the approved secret-management workflow before creating/changing PPPoE passwords.

No Worker deployment, D1 mutation, or secret change is performed by this branch.
