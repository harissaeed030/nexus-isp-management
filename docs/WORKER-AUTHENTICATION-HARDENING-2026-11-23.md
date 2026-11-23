# Worker authentication hardening — 2026-11-23

## Change saved

The D1 API Worker's password verifier now:
- rejects non-string password/hash/salt inputs;
- accepts only 64-character hexadecimal PBKDF2-SHA256 hashes and 32-character hexadecimal salts;
- refuses to fall back to comparing a submitted password directly with the stored hash when a salt is missing;
- compares all 64 derived-hash characters before returning a match result.

This closes the previous unsalted/plaintext fallback and avoids early-exit hash comparison. Password derivation remains PBKDF2-SHA256 with 100,000 iterations and a 16-byte random salt.

## Live data compatibility preflight

Read-only aggregate SQL was run against both live NEXUS D1 databases before making this verifier change:

| Environment | User accounts | Invalid/missing hash or salt shape | Customer portal accounts | Invalid/missing hash or salt shape |
|---|---:|---:|---:|---:|
| Production | 1 | 0 | 0 | 0 |
| Staging | 261 | 0 | 131 | 0 |

Only aggregate counts were retrieved; no password hashes, salts, emails, or customer details were selected or exposed.

The preflight indicates that the currently stored account rows in both environments have the expected hash and salt lengths. It does not prove that users can authenticate, nor does it replace a credential-verification integration test.

## Verification and deployment

A contract test was added to guard against reintroducing the unsalted fallback and to check the full-length comparison loop. The Cloudflare D1 API Worker workflow passed for commit `046f815422c39455e97124ee04b303293323c629`.

The backend workflow initially failed because an architecture-boundary test still expected the old health-check Wrangler file to bind the legacy `nexus-db` database. The test was updated to assert the intended isolated development health-check configuration has no D1 binding. Its regular expressions were corrected after the first retry. A new CI run is pending for the latest branch commit.

No production or staging credentials were changed. No Worker was deployed as part of this change.


## Deployed Worker verification (read-only)

The live Worker script uploads were inspected after the source change. The current 100%-traffic deployments are:
- Production `nexus-saas-api`, version 28, uploaded 2026-11-23 05:27:32 UTC.
- Staging `nexus-saas-api-staging`, version 29, uploaded 2026-11-23 05:26:35 UTC.

Both deployed script bundles still contain the previous verifier, including the `if(!salt)return pw===h` fallback. Therefore the fail-closed verifier change is **saved and CI-verified in GitHub, but is not yet deployed to either Worker**.

The production version binds the production D1 database; staging binds the staging D1 database. Both have secret bindings (JWT, CORS, Turnstile; staging also has PPPoE encryption). Secret values were not read. No deployment was initiated because replacing a live Worker requires preserving all current bindings and reconciling the branch source against the deployed bundle; a blind upload could break authentication, CORS, RouterOS encryption or production traffic.
