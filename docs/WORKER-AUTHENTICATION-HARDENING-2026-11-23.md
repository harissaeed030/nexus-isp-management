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


## Current deployed Worker verification (read-only; 2026-11-23)

The current 100%-traffic deployments were re-checked against Cloudflare's deployment and script APIs:

| Environment | Active Worker version | Upload time (UTC) | Live password verifier |
|---|---:|---|---|
| Production `nexus-saas-api` | 29 | 06:07:50 | **Old verifier** — still contains `if(!salt)return pw===h` |
| Staging `nexus-saas-api-staging` | 31 | 06:04:37 | **Hardened verifier** — rejects malformed inputs and unsalted hashes, derives PBKDF2-SHA256, and compares all 64 characters |

The staging version 30 candidate recorded earlier has been superseded by active version 31. The staging bundle also contains the Pages preview-origin CORS change. It does not yet contain the newest customer-complaint priority persistence change from this branch.

Current binding names were checked without reading any secret values:

- Production: `ALLOWED_ORIGINS` (secret), `DB` (D1), `ENVIRONMENT`, `JWT_SECRET` (secret), `NETWORK_CONNECTOR_ENABLED`, `TURNSTILE_SECRET_KEY` (secret).
- Staging: the same names plus `PPPOE_ENCRYPTION_KEY` (secret).

The production D1 binding remains `ce88098b-bff4-4d06-a0df-7bf29622a085`; staging remains `194f62e2-2766-48ab-be17-81248610c0cd`. Secret values were not read or changed.

**Current security status:** staging is running the fail-closed verifier, but production still runs the old verifier. No Worker was deployed or promoted during this continuation. Production deployment remains blocked pending a reviewed bundle/config comparison and staging end-to-end verification; a blind upload could break authentication, CORS, D1 access, Turnstile, or PPPoE encryption.

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


## Customer portal integration follow-up

A source-to-source audit found that the static customer portal still expected an older backend response shape. It now consumes the hosted D1 Worker contract for customer profile, subscriptions, invoice totals/paid/outstanding amounts, payment method/date, and support tickets. The portal contract tests cover the route aliases and the current DTO field names.

The portal complaint form already offered priority selection, but the D1 Worker previously inserted every customer-submitted ticket as `medium`. The Worker now validates the submitted priority (`normal`, `low`, `medium`, `high`, or `urgent`), maps `normal` to `medium`, and persists the resulting value using a bound SQL parameter. Contract tests cover this behavior.

The CI run for commit `f736f35d812ebd250425b4f89c989b94d4720a6d` passed all four checks (backend verification, backend checks, Cloudflare D1 API Worker, and NEXUS backend verification). This confirms source syntax and automated tests; live customer sign-in and live Worker deployment remain unverified.


## Cloudflare Pages environment routing

The Pages project has separate environment variables configured: preview `API_URL` points to `nexus-saas-api-staging`, while production `API_URL` points to `nexus-saas-api`. The static dashboard previously hard-coded the production Worker as its default API target, which could make preview testing touch production data; the customer portal used relative API paths without a Pages-to-Worker proxy.

The repository now includes a Pages Function at `functions/api/[[path]].js` that forwards same-origin `/api/*` requests to the environment's `API_URL`, preserving method, headers, body, and query string. Root `_routes.json` limits Function invocation to `/api/*`, so static pages and assets do not invoke the proxy. The dashboard now defaults to the same-origin proxy on Pages hosts and clears a stale direct API override there. This lets preview use the configured staging Worker and production use the configured production Worker.

The Pages routing change passed the three GitHub verification workflows on commit `f186889c31b2da7a66fe74215c87063073b16b60`. The Pages preview build and a live end-to-end sign-in through the proxy still need verification after Cloudflare finishes its deployment.


### Preview deployment result

Cloudflare Pages completed the preview deployment for branch `build/nexus-isp-core`, commit `758065eae992dd49859bb9206206d3c4d6037b4f`, at `https://67f51788.nexus-isp-management.pages.dev`. All four GitHub verification workflows also passed for that commit. The deployment status confirms the Pages build and deploy stages succeeded; it does not by itself prove a real customer login, billing workflow, or live Worker authentication round trip.


## Latest follow-up — 2026-11-23

The portal complaint-priority normalization is now a directly exported helper, and the contract suite tests its actual behavior for the default, all supported values, invalid strings, and non-string input. The Worker route uses this helper before writing the D1 row. This supplements the existing SQL binding and route-contract assertions.

Source changes are on branch `build/nexus-isp-core` at commit `809b12f51afb4c45f7855ffcf74b3efb7fcf003d`. All four GitHub workflows passed for that commit: Cloudflare D1 API Worker, Nexus backend checks, Nexus backend verification, and NEXUS backend verification. The Worker workflow ran JavaScript syntax validation and the D1 API contract tests; backend checks ran `npm run verify` successfully.

Cloudflare was re-audited after those source changes. The active staging Worker remains version 31 (100% traffic) on the staging D1 database; the active production Worker remains version 29 (100% traffic) on the production D1 database. The current source commit has **not** been uploaded as a Worker version and no deployment or traffic shift was performed. Production version 29 still requires the reviewed password-verifier hardening before it can be considered secure; staging version 31 has the hardened verifier but does not yet include the newest complaint-priority helper.

Direct HTTP checks of the `workers.dev` health endpoints could not be completed from the available browser path. Treat live sign-in, portal ticket creation, and end-to-end Pages-to-Worker requests as unverified until exercised from a browser or a supported live test harness. No D1 migrations, production data writes, or production Worker deployments were performed during this follow-up.


## Staging recovery and candidate deployment — 2026-11-23

A live deployment audit found that staging Worker version 32 had become active at 100% traffic and its downloaded script contained the legacy unsalted/plaintext password fallback (`if(!salt)return pw===h`). This was not the verified hardened build. To restore the last known hardened build, staging was rolled back to version 31 (version ID `097962ad-bc17-4564-8011-0702a4fb8fcf`) at 100% traffic. The rollback deployment was verified before proceeding.

The CI-verified source from commit `809b12f51afb4c45f7855ffcf74b3efb7fcf003d` was then uploaded as staging Worker version 33 (version ID `d76792db-7e0f-40ea-bda1-582ee4a2ce99`). The candidate was inspected before promotion: it contains the hardened PBKDF2 verifier (requires a 64-character hex hash and 32-character hex salt; no plaintext fallback), the portal priority normalizer, and the bound SQL insert that persists the validated priority. Candidate startup validation reported 5 ms. Its binding inventory was checked: staging D1 ID `194f62e2-2766-48ab-be17-81248610c0cd`, `ENVIRONMENT=staging`, `NETWORK_CONNECTOR_ENABLED=false`, and the existing secret binding names were retained; secret values were not read.

Version 33 was promoted to the staging Worker at 100% traffic. The active deployment was verified as deployment `688f07f3-f80a-4db3-ad20-ab44a08a4567`, routing 100% to version 33. Version 32 is no longer active. The browser-based live health/login path remains unverified because the available browser fetch path cannot reach the Workers endpoint; automated source and contract tests passed for the source commit.

A separate production audit found that the current production Worker is version 31 (not the previously recorded version 29), at 100% traffic, with production D1 ID `ce88098b-bff4-4d06-a0df-7bf29622a085`. Its downloaded script still contains the legacy plaintext fallback and does not yet contain the portal priority helper. Production has not been modified in this follow-up. Do not promote a production build until a staging live-authentication smoke test, a reviewed production binding/config comparison, and a rollback plan are complete.
