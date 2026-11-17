# NEXUS Network Automation Roadmap

**Status:** Proposed implementation plan; no physical-device actions authorized  
**Product target:** Multi-tenant ISP SaaS  
**Network scope:** MikroTik now; HSGQ OLT / Huawei ONU and TR-069 in staged follow-up

## 1. Safety boundary

This roadmap starts network automation development without changing production infrastructure.

The following remain prohibited unless the user gives separate, explicit approval for the exact operation and target:
- Deploying a Worker or Pages release to production.
- Applying D1 migrations or changing production records.
- Creating, rotating, or changing Cloudflare secrets.
- Sending configuration, provisioning, reboot, disable, disconnect, or other write commands to a live router, OLT, ONU, or ACS.
- Storing real network credentials in source code, logs, browser storage, or plaintext D1 fields.

The first implementation tranche is offline/mock-only. It must not open sockets to real devices.

## 2. Product architecture

Hosted SaaS:
- Cloudflare Pages is the current frontend host.
- Cloudflare Worker is the hosted API boundary.
- D1 owns hosted tenant, user, device-inventory, command-audit and job metadata.
- A network connector/agent must run inside the ISP's reachable network when a device is not publicly reachable. A public Worker must not be assumed to have direct access to a private MikroTik or OLT LAN.
- Connector identity is bound to one organization; it receives only explicitly authorized jobs and reports signed/validated results.

Local/offline:
- Node.js + SQLite remains a separate local runtime.
- Existing local MikroTik, OLT/ONU and GenieACS adapters are inspected and reused where safe.
- No automatic SQLite↔D1 replication is implied.

## 3. Versioned adapter contract (initial proposal)

Each adapter should implement a narrow capability-based interface:

- `getCapabilities()`: vendor, model, firmware/protocol, supported read/write capabilities.
- `healthCheck()`: connection state and latency; never return credentials.
- `readInventory()`: devices/interfaces/ONU inventory with stable external identifiers.
- `readStatus()`: bounded status/telemetry snapshot with collection timestamp.
- `plan(operation, input)`: validate and return a dry-run plan; must not execute.
- `execute(operation, input, approvalContext)`: unavailable in the first tranche. Future write execution must require a server-issued approval record, idempotency key, tenant scope and capability check.

Every request/result carries:
- `contractVersion`
- `organizationId`
- `deviceId`
- `requestId` / idempotency key
- `requestedBy`
- `operation`
- `createdAt`

Never include passwords, private keys, community strings or ACS credentials in adapter responses, audit payloads or UI data.

## 3A. Implementation status on the feature branch

Completed in code (not deployed):
- Local backend: versioned adapter contract, MikroTik read-only capability allow-list, identity/resource/interface/PPPoE read routes, default-locked PPPoE/TR-069 write gate.
- Hosted Worker: tenant-scoped connector registration, one-time token issuance (SHA-256 hash stored), connector job queue, idempotency, 60-second claim lease, result redaction and tenant-scoped audit.
- Local connector agent: explicit hosted-device-to-local-router mapping, local tenant scoping, TLS-only RouterOS transport and read-only capability execution.
- Focused CI: adapter, safety, agent and Worker contract checks.

Validation:
- GitHub Actions Network safety and adapter contract run #28 passed after installing backend dependencies.
- GitHub Actions SQLite-D1 sync contract run #44 passed.
- No full product release, live hardware acceptance or production deployment is implied.

Deployment gate:
- Worker connector routes require `NETWORK_CONNECTOR_ENABLED=true`.
- The Worker migration runner automatically applies the new additive D1 tables on the first API request after deployment. A Worker deployment therefore requires explicit approval for the chosen environment and its bound D1 database.
- The local connector agent is not started automatically and has not connected to any physical device.

## 4. Delivery phases

### Phase 0 — inventory and simulator (first)
- Inventory the existing local MikroTik, OLT/ONU and GenieACS source modules.
- Record exact protocol/library dependencies and supported commands.
- Define typed request/result schemas and capability names.
- Implement mock adapters and deterministic fixtures.
- Add contract tests for tenant binding, unsupported capabilities, timeouts, malformed responses and secret redaction.
- No real network sockets or device commands.

### Phase 1 — MikroTik read-only
Target hardware for later acceptance: MikroTik RB750Gr3, RouterOS 7.
- Start with identity, RouterOS version, resource health, interface status and PPPoE active-session reads.
- Use a dedicated least-privilege RouterOS account and a private-network connector; never expose router credentials to the browser.
- Add tenant-scoped device registration, connection health and immutable audit events.
- Keep all write capabilities disabled.

### Phase 2 — OLT / ONU read-only
Target hardware for later acceptance: HSGQ-G04R OLT and Huawei ONU.
- Confirm the supported management protocol and firmware for the exact hardware.
- Begin with discovery, optical/status reads and inventory reconciliation.
- Distinguish configured inventory from live telemetry and last-seen state.
- Do not change VLAN, PON, ONU authorization, profiles, firmware or reboot state.

### Phase 3 — TR-069 / GenieACS
- Confirm ACS endpoint ownership, supported GenieACS API version and device inform behavior.
- Design per-tenant encrypted credentials, key rotation, redaction and audited access before hosted credential storage.
- Begin with read-only device summaries and parameter reads.
- Keep the existing local adapter separate until a reviewed hosted integration exists.

### Phase 4 — guarded write operations (future approval gate)
Only after non-production hardware acceptance:
- Explicit allow-list of supported operations; no arbitrary CLI or parameter paths.
- Role and permission checks, tenant/device binding, fresh confirmation and approval record.
- Idempotency, rate limits, maintenance windows, command timeout and bounded retries.
- Pre-change snapshot, rollback/compensation plan, immutable audit and operator-visible result.
- Per-operation feature flag defaulting OFF.
- A separate user approval before any live-device execution.

## 5. Initial capability identifiers

Read-only candidates:
- `mikrotik.identity.read`
- `mikrotik.resource.read`
- `mikrotik.interfaces.read`
- `mikrotik.pppoe.sessions.read`
- `olt.inventory.read`
- `onu.status.read`
- `tr069.devices.read`
- `tr069.parameters.read`

Write capabilities are intentionally not enabled or promised by this roadmap.

## 6. Definition of done for Phase 0

- Adapter inventory is based on actual source files, not assumptions.
- Contract schema is versioned and documents errors/timeouts.
- Mock tests cover tenant isolation and secret redaction.
- Tests prove `plan()` does not execute a command.
- No real device connection is attempted.
- No production Cloudflare resource, D1 record, secret or deployment is changed.

## 7. Relationship to ADR-001

ADR-001 remains accepted for the current hosted milestone until a separate architecture decision is reviewed. This document is a proposal to begin the network-automation foundation in parallel; it does not silently enable live hosted control or override existing safety gates.
