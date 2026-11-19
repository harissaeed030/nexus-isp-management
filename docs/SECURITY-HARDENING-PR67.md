# PR #67 security hardening

- New passwords use versioned PBKDF2-HMAC-SHA256 at 600,000 iterations. Existing salted 100,000-iteration owner/staff and customer-portal hashes remain verifiable and upgrade after successful login. Missing/malformed salts fail closed; plaintext fallback is removed. New passwords are limited to 8–128 characters.
- Production JSON API responses set Cache-Control: no-store and Pragma: no-cache.
- Registration is throttled to 5 attempts per IP and 3 per normalized email per 15 minutes. This does not replace Cloudflare edge rate limiting or verified-email onboarding.
- New PPPoE ciphertext uses the separate PPPOE_ENCRYPTION_KEY secret (minimum 32 bytes) and enc:v2. Existing enc:v1 values remain decryptable with the original JWT_SECRET HKDF derivation. Keep JWT_SECRET until legacy v1 records are re-encrypted through a separately reviewed process.
- SQLite triggers reject payment promises with cross-tenant customer/creator IDs on insert and update.

## Migration numbering correction — 2026-11-17

A read-only inspection of both live D1 migration ledgers found that staging already assigns ID 14 to `0014_router_credential_cipher` and has applied migrations through ID 21. Production records migrations through ID 13. The earlier security migration ID 14 therefore collided with the staging history and was not safe to apply.

The security migration has been renumbered to **ID 22**, using `cloudflare/d1/migrations/0022_security_hardening.sql`. ID 22 is unused in both inspected environments. The SQL, ledger insert, Python idempotency test and source-contract guard now all require the exact ID/name pair `(22, 0022_security_hardening)`. Do not apply the migration until the separately approved staging preflight and backup are complete.

## Release gates
1. Apply migration 0022 only after an approved staging D1 preflight and verified backup. This source change does not apply the migration.
2. Run Cloudflare workerd password-hash profiling and staging E2E before deployment. 600,000 PBKDF2-HMAC-SHA256 iterations follows OWASP guidance where PBKDF2/FIPS is required; measured Worker latency/load remains a release gate.
3. Verified-email/invite onboarding and Cloudflare edge rate limiting remain separate release gates. Account currently has no zones, so zone-level rate limiting cannot be configured.
4. Review key rotation and legacy PPPoE v1 re-encryption before production.
5. Configure PPPOE_ENCRYPTION_KEY only through the approved secret-management workflow before creating/changing PPPoE passwords.

No Worker deployment, D1 mutation, or secret change is performed by this branch.
