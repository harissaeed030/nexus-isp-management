# PR #67 security hardening

- New passwords use versioned PBKDF2-HMAC-SHA256 at 600,000 iterations. Existing salted 100,000-iteration owner/staff hashes remain verifiable and upgrade after successful login. Missing/malformed salts fail closed; plaintext fallback is removed. New passwords are limited to 8–128 characters.
- Production JSON API responses set Cache-Control: no-store and Pragma: no-cache.
- Registration is throttled to 5 attempts per IP and 3 per normalized email per 15 minutes. This does not replace Cloudflare edge rate limiting or verified-email onboarding.
- New PPPoE ciphertext uses the separate PPPOE_ENCRYPTION_KEY secret (minimum 32 bytes) and enc:v2. Existing enc:v1 values remain decryptable with the original JWT_SECRET HKDF derivation. Keep JWT_SECRET until legacy v1 records are re-encrypted through a separately reviewed process.
- SQLite triggers reject payment promises with cross-tenant customer/creator IDs on insert and update.

## Release gates
1. Configure PPPOE_ENCRYPTION_KEY before creating/changing PPPoE passwords. This commit does not set secrets.
2. Apply migration 0013 only after approved staging D1 preflight. No D1 was changed by this commit.
3. Run Cloudflare workerd password-hash profiling and staging E2E before deployment. 600,000 PBKDF2-HMAC-SHA256 iterations follows OWASP guidance where PBKDF2/FIPS is required; measured Worker latency/load remains a release gate.
4. Verified-email/invite onboarding and edge rate limiting remain separate release gates.
5. Review key rotation and legacy PPPoE v1 re-encryption before production.
No Worker deployment, D1 mutation, or secret change was performed.
