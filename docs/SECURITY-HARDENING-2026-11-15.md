# NEXUS Security Hardening — 2026-11-15

## Scope
This change addresses three source-review findings in both the staging and production Cloudflare Worker bundles.

## Changes
1. **Reject unsalted/plaintext password fallback.** Password verification now requires a valid 16-byte hexadecimal salt and a valid PBKDF2 hash. Missing-salt records fail closed and require a controlled password reset; plaintext equality is no longer accepted.
2. **Versioned PBKDF2 hashes at 600,000 iterations.** New hashes use the `pbkdf2-sha256$600000$<hex>` format. Existing salted, unversioned 100,000-iteration hashes remain verifiable only for migration on successful login, then are transparently rehashed and stored in the versioned format. This avoids a bulk password reset for valid legacy users. Hash upgrades are applied to both staff users and customer-portal accounts. The verifier bounds accepted iteration counts to 100,000–1,000,000.
3. **Safe API exception responses.** The top-level Worker catch returns a generic error and correlation ID. Server logs contain only the correlation ID and allowlisted error class, not raw exception text.

## Validation
The Worker regression suite tests both bundles for fresh versioned hashes, correct and incorrect passwords, rejection of plaintext and missing-salt records, legacy salted hash verification and upgrade eligibility, and safe error responses.

## Rollout cautions
- Do not modify production secrets or deploy this branch automatically.
- Existing records without a valid salt cannot authenticate; handle them through an owner-controlled password reset.
- 600,000 PBKDF2 iterations must be benchmarked in the target Workers runtime and tested under expected login load before production rollout. Node CI timing alone is not a Cloudflare runtime benchmark.
- Cloudflare Workers Free has a 10 ms CPU-time limit per HTTP request. Treat the 600,000-iteration setting as **not production-approved** until a real Worker-runtime benchmark proves it fits the configured CPU budget; if it does not, keep this PR/deployment blocked and choose an architecture that preserves the security requirement without exceeding the Free-tier limit.
- A third-party penetration test remains a separate release gate.
