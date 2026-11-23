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


## Frontend/API integration follow-up

A route audit found that the hosted dashboard's first-owner / new-workspace setup form called `/api/v1/setup`, but the D1 Worker exposes tenant registration at `/api/v1/tenants/register` (normalized to `/api/auth/register`). The dashboard now targets the actual registration route.

The dashboard also displayed a password-reset form that called an endpoint not implemented by the hosted D1 Worker and had no configured email-token delivery flow. It now clearly explains that hosted password recovery is not enabled and directs the user to the workspace owner/admin, rather than submitting a guaranteed-failing request or implying a reset token can be issued.

A new architecture-boundary contract test covers both behaviors. All four GitHub workflow checks passed for commit `49a0d7651174376149fc20f1cdabfa89c697bc5c`:
- Nexus backend verification
- Nexus backend checks (including `node --check assets/js/app.js`)
- Cloudflare D1 API Worker checks
- NEXUS backend verification

This verifies source syntax and contract tests; it does not constitute a live browser sign-in test or Worker deployment.


## Cloudflare Pages preview

The connected Pages project `nexus-isp-management` is configured with `main` as its production branch. The updated `build/nexus-isp-core` branch was automatically built and deployed as a **preview**, not production:

- Preview: https://212e72d2.nexus-isp-management.pages.dev
- Source commit: `1c86cd50c3d0bbe48a6bfad0e1e6391b6db2255e`
- Build and deploy stages: success (2026-11-23 05:40 UTC)

This confirms the static dashboard preview is published. It does not prove browser sign-in, API CORS, or live D1 functionality. The production Pages branch remains `main`; no production Pages promotion or Worker deployment was performed.


## Staff role contract follow-up

The dashboard previously offered a `noc` role, but the D1 Worker only accepts `admin`, `billing`, `support`, `technician`, and `staff`. The UI now maps the network/NOC and field technician job description to the supported `technician` role and no longer submits the unsupported `noc` value. A contract test ensures the dashboard role choices stay within the Worker enum.

The role contract change is included in commit `5b2d770a5d60a2ba39698d64d8e738f21a689122`; all four CI checks passed for that commit. Cloudflare Pages also published a preview:
https://071fff80.nexus-isp-management.pages.dev

The preview is not the production Pages site and does not switch the production API.


## Preview-origin CORS follow-up

The static Pages preview is hosted on a deployment-specific subdomain such as `071fff80.nexus-isp-management.pages.dev`. The D1 Worker's previous CORS check trusted only the root Pages hostname, which could block browser API requests from preview deployments unless each preview URL was manually added to the secret allowlist.

The Worker now accepts HTTPS origins on the exact NEXUS Pages project hostname and its subdomains, while rejecting lookalike domains and HTTP origins. The CORS header builder is exported for direct contract testing. The Cloudflare D1 API Worker workflow passed for commit `992064bab4948a69189f091a62efe8ede948ec73`.

This is a source and test change only. The currently deployed production and staging Worker versions have not been replaced; the CORS fix becomes effective only after a reviewed Worker deployment.


## Staging candidate version uploaded (not deployed)

A new candidate version was uploaded to the existing staging Worker only:
- Worker: `nexus-saas-api-staging`
- Candidate version: `30`
- Version ID: `3c0f065c-3719-444e-8d6c-438d4a5cc7f1`
- Source branch commit: `6a650dc7d5602b86a5a0419074658520891bbb6f`
- Runtime startup validation: 4 ms
- Handlers: `fetch`, `scheduled`

The candidate metadata confirms it retains the staging D1 binding and all four existing secret-text binding names (values remain secret and were not read), as well as the staging environment variables. The currently active staging deployment was separately checked and still routes 100% of traffic to version 29. Version 30 has **not** been promoted or assigned traffic.

No production Worker or D1 database was changed. This creates a rollback-free staging candidate for further validation without interrupting the currently active staging API.
