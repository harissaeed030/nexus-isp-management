# NEXUS ISP Management — Technical Audit and Repair Status

**Date:** 2026-11-15  
**Target branch:** `build/nexus-isp-core`  
**Original broken head:** `278352624227f64200022c447332ef5cb7daea4f`  
**Merged repair PR:** [#39](https://github.com/harissaeed030/nexus-isp-management/pull/39)  
**Merge commit:** `72eb185cb9a7c5f03f74babf839df00e5446f234`

## Executive summary

The missing `registerMikroTikRoutes` export and RouterOS route handlers were restored in PR #39, which was merged into `build/nexus-isp-core`. The repair restores tenant-scoped PPPoE/router actions, encrypts stored router API credentials using AES-256-GCM, and separates inventory permissions from live provisioning permissions.

The PR repair head passed the three GitHub Actions workflows listed below. After merge, additional hardening commits were added:
- Wait for the TLS `secureConnect` event (not merely TCP `connect`) before sending RouterOS API credentials over API-SSL.
- Fail production startup when `ROUTER_CREDENTIAL_KEY` is missing or is not exactly 32 bytes represented as 64 hexadecimal characters.

The later PR #49 integration pass re-ran the backend, database-hardening, migration-reconciliation and syntax workflows successfully on its head. See the current integration status below.

## Latest integration status — 2026-11-15

PR [#49](https://github.com/harissaeed030/nexus-isp-management/pull/49), **Complete ISP operations and connect network inventory dashboard**, was merged into `build/nexus-isp-core`.

- Merge commit: `bb1be993b43fe628db0c329d6f36433477df61da`.
- PR head tested: `d3a13a58fb5ddb50acb9e3ff2c98cf9c4608af16`.
- Changes include tenant-scoped ISP operations APIs, OLT/ONU inventory dashboard screens and mapping, payment-promise migration, and corrected local SQLite / Cloudflare runtime documentation.
- The OLT credential-tampering test was corrected to modify the AES-GCM authentication tag rather than the last Base64URL character, which could alter only unused padding bits.

GitHub Actions on the PR head completed successfully:

| Workflow | Run | Result |
|---|---:|---|
| Nexus backend verification (`npm run verify`) | [43681606695](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43681606695) | Success |
| Nexus backend checks | [43681606701](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43681606701) | Success |
| Database hardening tests | [43681606698](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43681606698) | Success |
| SQLite migration reconciliation | [43681606705](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43681606705) | Success |

These are GitHub-hosted PR checks on the tested head. They are not evidence of live hardware compatibility, a production deployment, or an operational database restore rehearsal.

### Branch and runtime separation

- `build/nexus-isp-core` is the local Node.js/SQLite development line.
- `main` contains the separately released Cloudflare Worker/D1 customer-portal path.
- The two lines have diverged (225 commits ahead and 11 behind at the latest check; the previously CI-verified code head was `5b418f6b5ff93e45337768efaf0ac14bc6e8db29`). Do not merge them blindly or deploy this branch's minimal `worker/` health-check foundation over the released production Worker.
- The older draft tenant-login PR #48 is not required for this integration: the merged local API already supports tenant-aware login selection via `tenantSlug` and safely rejects ambiguous identities.

## Latest branch-head CI — 2026-11-15

The `build/nexus-isp-core` code head before the no-test implementation commits was `5b418f6b5ff93e45337768efaf0ac14bc6e8db29`. Both workflows for that earlier code head completed successfully:

| Workflow | Run | Result |
|---|---:|---|
| Nexus backend verification | [43681795469](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43681795469) | Success |
| Nexus backend checks | [43681795561](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43681795561) | Success |

This confirms the latest development branch head passed the configured GitHub backend checks. It does not clear the live-device, independent security review, production secret configuration, or backup/restore release gates below.

## Changes merged in PR #39

- Restored `registerMikroTikRoutes` and tenant-scoped RouterOS/PPPoE route handlers.
- Restored router logs, connection test, active PPPoE sessions, secrets/profiles, create/update/suspend/restore, customer mapping, and sync routes.
- Kept router inventory CRUD in `operations.routes.js`; no duplicate inventory route registration.
- Added AES-256-GCM encryption for router credentials at rest; credentials are excluded from API response projections.
- Made API-SSL port 8729 the default and reject unencrypted API port 8728 in production.
- Split permissions between router inventory management, read-only operations, and live provisioning/sync.
- Added regression tests for encryption/tamper detection, permission mapping, staff role boundaries, and credential encryption in the smoke test.
- Updated this audit to reflect the current branch and release gates.

## CI evidence on the PR repair head

All three workflows passed on code/test commit `4981854aa68fb4fcb4b4682fe07bfac804d674e7`:

| Workflow | Run | Result |
|---|---:|---|
| Nexus backend verification | [43665890678](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43665890678) | Success |
| Nexus backend checks | [43665890705](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43665890705) | Success |
| Database hardening tests | [43665890782](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43665890782) | Success |

The workflows ran `npm run verify`; the backend checks workflow also ran the dashboard JavaScript syntax check. These are GitHub-hosted CI results, not local command execution.

## Post-merge hardening

- RouterOS API-SSL connection setup now waits for the TLS handshake's `secureConnect` event before attempting authentication.
- Production environment validation now requires `ROUTER_CREDENTIAL_KEY` to be a 64-character hexadecimal value (32-byte key). The secret is never committed to source control.
- The post-merge hardening commits are `940ad37d292765551ab2e4c737d48258d790272e` and `ed31add8a8d448012315db613506c98fe07e7cb4`.
- GitHub Actions on these latest post-merge commits must complete successfully before marking the current head fully verified.

## Required deployment configuration

Before deploying the API in production:
1. Generate a cryptographically random 32-byte key and encode it as 64 hexadecimal characters.
2. Set it as `ROUTER_CREDENTIAL_KEY` in the deployment's secret manager/environment. Never put it in Git, frontend code, or logs.
3. Store a secure offline recovery copy. Losing the key makes existing encrypted router credentials unrecoverable.
4. Restart the service and confirm production environment validation passes.
5. Add router credentials through the API using the encrypted credential fields; use API-SSL port 8729.

No production secret was created or installed in this repository session. The actual key must be generated and stored in the intended deployment secret manager by an authorized operator.

## External integration and recovery release gates

These checks cannot be honestly marked complete from source code or CI alone:

1. **MikroTik:** Connect a non-production RouterOS device over API-SSL; verify identity/resource reads, PPPoE session and profile reads, secret create/update, suspend/restore, and synchronization. No router was connected in this session.
2. **OLT/ONU:** The HSGQ-G04R adapter does not provide verified live vendor communication/configuration. Obtain the exact supported vendor interface and validate safe read-only operations before claiming optical levels, alarms, or provisioning.
3. **GenieACS/TR-069:** Test against a real ACS and supported ONU: inform, device identity, parameter reads, and explicitly approved writes. No ACS/device session was run.
4. **Backup/restore:** Perform a backup and restore rehearsal against a copy of the intended production database and confirm integrity, foreign keys, and application startup. Automated test coverage is not a production restore drill.
5. **Production architecture/security:** Confirm persistent database storage, HTTPS termination, firewall/network access, secrets, tenant isolation, session handling, independent security review, and mobile/browser acceptance on the intended deployment.
6. **Payments and recurring billing:** Verify real payment workflows and any scheduled billing requirements against the actual deployment and provider; CI simulation is not a live payment test.

## Scope and safety

- PR #39 is merged into `build/nexus-isp-core`.
- No customer database, production deployment, Cloudflare resource, or external network device was changed.
- No live MikroTik, OLT/ONU, or GenieACS operation was attempted.
- No production credentials or encryption secrets were added to source control.
- No production migration was applied.

## Release decision

**Production remains NO-GO until the required production configuration, live-device, backup/restore, and independent security checks have documented evidence.** The original backend startup/import blocker is fixed and merged; the current integration PR's automated checks passed, but that does not establish full production readiness.


## Non-test implementation work — 2026-11-15

The user requested that remaining implementation work proceed without running additional tests. The following source changes were committed to `build/nexus-isp-core`:

- Added tenant-scoped CSV exports for customers, invoices, payments and support tickets at `/api/v1/exports/{type}.csv`.
- Added optional inclusive `from` / `to` date filters, per-module permissions, a 50,000-row cap, UTF-8 BOM, safe CSV quoting and spreadsheet-formula injection mitigation.
- Added Reports-screen download controls for the four CSV exports.
- Added an opt-in monthly invoice scheduler using the Asia/Karachi timezone (05:15 on day 1), tenant-by-tenant transactional invoice generation, unique-period idempotency and catch-up after downtime.
- Automatic billing remains disabled by default. An operator must explicitly set `AUTO_BILLING_ENABLED=true` in the backend environment after reviewing the financial workflow.
- Updated README and `.env.example` to document the new features and opt-in setting.

The new implementation was committed without running tests or CI, as requested. The current branch head therefore has no fresh CI result. Do not interpret these commits as tested or production-approved. The scheduler is code-complete but intentionally inactive unless enabled. Live MikroTik, HSGQ OLT, Huawei ONU / GenieACS integrations still require vendor interfaces and device access; no hardware test or production change was performed.
