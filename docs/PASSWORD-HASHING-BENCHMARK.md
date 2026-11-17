# NEXUS Worker password-hashing benchmark

**Status:** Benchmark harness added; password-hash iteration count is NOT approved for production by this work.

## Source finding

As of this branch revision, both `worker/src/index.js` (staging source) and `worker/src/production-worker.js` (production bundle) use `PBKDF2-HMAC-SHA256` with **100,000 iterations** in `hashPw`. The older security review PR #57 describes a 600,000-iteration proposal and explicitly blocks release pending a real Worker-runtime benchmark. Do not assume that proposal is active in these two files.

## Run a local workerd estimate

From the repository root, with Node.js and internet access for the one-time Wrangler package download:

```sh
node worker/benchmarks/run-password-hash-benchmark.mjs
```

The runner starts a standalone, local-only Wrangler Worker bound to `127.0.0.1`, uses a fixed synthetic password and random salts, warms up once, and measures five samples each at 100k, 200k, 300k and 600k PBKDF2 iterations. It prints median, p95, minimum and maximum elapsed milliseconds. The benchmark Worker has no D1 binding, secrets, routes, or production credentials. Its Wrangler config disables workers.dev and preview URLs.

## Interpretation and release gate

- The local `workerd` measurement is useful for comparing candidate iteration counts on the same machine/runtime. It is **not** a measurement of Cloudflare production CPU time.
- Cloudflare documents that deployed Worker timer APIs only advance after I/O. Do not use `performance.now()` around CPU-only work in a deployed Worker as a CPU meter.
- Cloudflare's current limits page lists 10 ms CPU per HTTP request on Workers Free and a 30-second default (configurable up to 5 minutes) on Workers Paid. Confirm the actual account/Worker CPU limit before selecting a target.
- Before approval, deploy only a reviewed, isolated staging candidate and capture a CPU profile using Cloudflare's production profiling workflow. Exercise the actual login/password-verification path with synthetic test accounts, inspect CPU time and error rates, and test the configured limit under realistic concurrent load.
- Keep the current iteration count unchanged until the staging profile and independent security review approve a value. Do not lower the iteration count merely to make the Free-plan limit fit; choose a hosting/security design that meets both requirements.
- Never run this benchmark against production customer accounts or real user passwords.

## What this change does not do

No password hashes, user records, secrets, D1 databases, deployed Workers or Pages assets were changed. No Cloudflare deployment or live benchmark was run.
