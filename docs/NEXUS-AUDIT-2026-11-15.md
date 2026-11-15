# NEXUS ISP Management — Technical Audit and Repair Update

**Date:** 2026-11-15  
**Target branch:** `build/nexus-isp-core`  
**Target branch head at audit start:** `278352624227f64200022c447332ef5cb7daea4f`  
**Repair branch:** `fix/restore-mikrotik-routes`  
**Repair head:** `9f562a1ebedbd0a355c46535652a5e46676eb55a`  
**Pull request:** [#39 — restore MikroTik API routes and RBAC permissions](https://github.com/harissaeed030/nexus-isp-management/pull/39)

## Executive summary

The original target branch head had a critical backend startup failure: `backend/src/app.js` imported and called `registerMikroTikRoutes`, but `backend/src/routes/mikrotik.routes.js` no longer exported that function. The same commit had removed the RouterOS action handlers.

The repair is implemented on a separate branch and submitted as PR #39. The PR restores the missing route registrar and tenant-scoped RouterOS/PPPoE actions, retains the existing router inventory CRUD in the operations module, adds encrypted credential storage/rotation, corrects router permission mapping, and adds regression assertions.

**CI on the repair head is green.** The PR is open and mergeable; the target branch has not yet been changed by merging this PR.

## Changes in PR #39

- Restored `registerMikroTikRoutes` so application imports and startup registration are valid.
- Restored tenant-scoped router logs, connection test, PPPoE active-session/secrets/profile reads, secret create/update/suspend/restore, customer-to-PPPoE mapping, and synchronization routes.
- Avoided duplicate `/api/v1/routers` inventory handlers; inventory CRUD remains in `operations.routes.js`.
- Added encrypted credential persistence and rotation using AES-256-GCM. Router API credentials are not returned in inventory responses.
- Kept API-SSL port 8729 as the default and reject unencrypted port 8728 in production.
- Corrected permission routing so inventory actions use `routers.manage`, read-only device queries use `routers.read`, and provisioning/synchronization actions use `routers.provision`.
- Added tests for credential encryption/tamper detection and router permission boundaries; smoke coverage asserts credentials are encrypted at rest.

## CI evidence for repair head

All three workflows completed successfully on `9f562a1ebedbd0a355c46535652a5e46676eb55a`:

| Workflow | Run | Result |
|---|---:|---|
| Nexus backend verification | [43665827452](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43665827452) | **Success** |
| Nexus backend checks | [43665827494](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43665827494) | **Success** |
| Database hardening tests | [43665827466](https://github.com/harissaeed030/nexus-isp-management/actions/runs/43665827466) | **Success** |

The successful verification workflows ran `npm run verify` (which runs `npm run check` and `npm test`). The backend-checks workflow also completed the dashboard JavaScript syntax check. The database-hardening workflow ran the same verification script.

**Execution boundary:** These are GitHub-hosted CI results. Local commands were not run in this session.

## Remaining verification and release gates

1. **Merge review:** PR #39 remains open. Review and merge it into `build/nexus-isp-core` before treating the target branch as repaired.
2. **Live MikroTik:** The RouterOS adapter and API routes are source/CI verified, but no real MikroTik endpoint was connected. Verify API-SSL reachability, credentials, PPPoE reads, provisioning, suspension/restoration, and sync against a non-production router.
3. **Credential operations:** Set `ROUTER_CREDENTIAL_KEY` to a stable 32-byte hex secret in the deployment secret store. Back it up securely; losing it makes stored router credentials undecryptable. Do not place it in source control or frontend configuration.
4. **OLT/ONU:** The HSGQ-G04R adapter does not establish live vendor communication or perform live configuration. Verify the actual vendor API/CLI and safe read-only operations before claiming live OLT/ONU status or provisioning.
5. **GenieACS/TR-069:** Adapter tests do not replace testing against a real ACS and supported ONU. Validate inform, device identity, parameter reads, and any writes separately.
6. **Data recovery:** Automated SQLite backup/restore tests pass, but a production-topology backup and restore rehearsal has not been performed.
7. **Production architecture/security:** Confirm the intended deployment topology, HTTPS edge, secret management, database persistence, tenant isolation, and independent security review. CI does not establish production readiness.

## Database and scope safety

- PR #39 does not add or alter database migrations.
- No customer database, production deployment, Cloudflare resource, or external network device was changed.
- No live device operation was attempted.
- Existing migration and database-hardening test suites passed in GitHub CI.

## Release decision

**Production remains NO-GO at this stage.** The branch-level startup/test blocker is repaired in PR #39 and all listed CI workflows pass on the repair head. However, the PR must be merged and the real deployment, backup/restore, security, MikroTik, OLT/ONU, and GenieACS checks must be completed before production approval.
