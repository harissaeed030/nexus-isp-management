# NEXUS ISP Management — Technical Audit and Repair Status

**Date:** 2026-11-15  
**Target branch:** `build/nexus-isp-core`  
**Original broken head:** `278352624227f64200022c447332ef5cb7daea4f`  
**Merged repair PR:** [#39](https://github.com/harissaeed030/nexus-isp-management/pull/39)  
**Merge commit:** `72eb185cb9a7c5f03f74babf839df00e5446f234`

## Executive summary

The missing `registerMikroTikRoutes` export and RouterOS route handlers were restored in PR #39, which was merged into `build/nexus-isp-core`. The repair restores tenant-scoped PPPoE/router actions, encrypts stored router API credentials using AES-256-GCM, and separates inventory permissions from live provisioning permissions.

The PR repair head passed the three GitHub Actions workflows listed below. After merge, branch push workflows were started. Additional post-merge hardening fixes were then committed:
- Wait for the TLS `secureConnect` event (not merely TCP `connect`) before sending RouterOS API credentials over API-SSL.
- Fail production startup when `ROUTER_CREDENTIAL_KEY` is missing or is not exactly 32 bytes represented as 64 hexadecimal characters.

These post-merge commits require their own completed CI runs before the latest branch head can be called green.

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

**Production remains NO-GO until the latest post-merge CI is green and the required production configuration, live-device, backup/restore, and security checks have documented evidence.** The original backend startup/import blocker is fixed and merged; that does not by itself establish full production readiness.
