# Existing Network Adapter Inventory

**Branch:** `work/core-feature-completion` source review  
**Reviewed:** 2026-11-17  
**Purpose:** Record actual local implementation before expanding hosted SaaS network automation.

## Runtime boundary

All implementation described here is in the local Node.js + SQLite backend. It is not proof that equivalent endpoints exist in the hosted Cloudflare Worker/D1 API. The hosted network UI currently exposes inventory only.

## MikroTik / RouterOS

### Existing code
- `backend/src/services/mikrotik-api.js`: custom RouterOS API sentence framing, TCP/TLS socket transport, bounded socket timeout, login and generic command method.
- Default API port is 8729 (TLS); code also permits port 8728 (plain TCP). Do not use plaintext API on an untrusted network. Future production acceptance should require TLS with certificate validation and a private network path.
- `backend/src/services/mock-mikrotik-api.js`: deterministic mock adapter for tests.
- `backend/src/routes/mikrotik.routes.js`: router credentials encrypted using AES-256-GCM; tenant-scoped router lookup; logs; connection test; read endpoints for active PPPoE sessions, secrets and profiles.
- The same route file also contains live write operations: create/update PPPoE secrets and suspend/restore secrets. These are not read-only.
- Router permission checks distinguish inventory permissions from `routers.provision`; role policy and endpoint authorization must be re-verified as part of the safety review.

### Existing tests
- Credential encryption/decryption and tamper rejection.
- Error redaction.
- Deterministic mock adapter.
- Permission distinction for inventory and provisioning.

### Gaps before safe live use
- Confirm the exact RouterOS version and API service/TLS configuration on a non-production RB750Gr3.
- Review TLS certificate validation, connection cleanup/timeouts and authentication behavior.
- Confirm least-privilege RouterOS user policy; avoid full-admin router credentials.
- Add command allow-list and explicit operation-level approvals for every write.
- Add tests for tenant IDOR, role bypass, duplicate/idempotent provisioning, failed/partial writes, rollback and secret redaction.
- Verify customer-to-router mapping cannot cross tenant boundaries.
- Keep the local adapter disabled by default unless an authorized test environment is configured.

## HSGQ-G04R / Huawei ONU

### Existing code
- `backend/src/services/olt-adapters.js`: capability declaration only; explicitly reports that vendor API specification is not verified and rejects live reads and configuration writes.
- `backend/src/routes/olt.routes.js`: tenant-scoped OLT/PON/ONU inventory, service mapping, AES-256-GCM credential encryption and audit/history records.
- `docs/HSGQ-G04R-INTEGRATION.md`: lists missing official API schemas, MIB/OIDs, read-only CLI references, exact firmware and Huawei ONU compatibility evidence.

### Current conclusion
OLT/ONU inventory exists, but live PON status, optical levels, alarms and provisioning are not implemented/verified. Do not label manually entered status as telemetry. No physical OLT/ONU connection is authorized by this inventory work.

## GenieACS / TR-069

### Existing code
- `backend/src/services/genieacs-adapter.js`: server-side GenieACS NBI client with HTTP(S) URL validation, bounded timeout/retries, Basic/Bearer auth, device listing, parameter retrieval, connection request, reboot and parameter writes.
- Parameter flattening redacts sensitive password/key-like parameter paths.
- `backend/src/routes/tr069.routes.js`: tenant-scoped ACS connections and device records; credentials encrypted using AES-256-GCM; connection tests, device sync, parameter reads, connection request, reboot, Wi-Fi parameter writes and TR-069 audit logs.
- These are local SQLite routes, not hosted Worker endpoints.

### Existing tests
- ACS URL validation, server-side auth, parameter flattening, bounded retry/timeout and sensitive parameter redaction.

### Gaps before safe live use
- Confirm exact GenieACS NBI version, deployment URL ownership, TLS, network reachability and Huawei ONU inform status.
- Review all ACS task endpoints and permission checks; connection request, reboot and Wi-Fi changes are writes/side effects even when ACS returns an accepted/queued response.
- Add per-operation confirmation/approval, allow-listed parameter paths, idempotency and completion polling.
- Verify that audit logs never persist passwords or sensitive parameter values.
- Test with a dedicated lab ONU before any customer device.

## Immediate implementation recommendation

1. Build a common versioned adapter contract and mock test suite without network sockets.
2. Add capability discovery and explicit read/write classification.
3. Add a read-only RouterOS profile and make insecure plaintext transport impossible for any new deployment configuration.
4. Keep all physical-device write routes behind an explicit disabled-by-default gate until a separate approval and lab acceptance.
5. Design a private-network connector for hosted SaaS; a public Cloudflare Worker cannot be assumed to reach the ISP's private router/OLT address directly.

## Safety statement

This source inventory did not connect to a router, OLT, ONU or ACS; it did not change D1, secrets, deployments or customer records. Existing local write-capable routes are documented as code presence only, not as approved or tested against real hardware.
