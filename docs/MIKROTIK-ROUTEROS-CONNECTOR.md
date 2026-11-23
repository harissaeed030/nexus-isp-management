# NEXUS MikroTik RouterOS Connector

Status: implementation contract and safety boundary (2026-11-23). This document does **not** claim a live router connection.

## Current verified state

- Production Worker stores router inventory and encrypts a supplied router password in `network_devices.credential_password_cipher`.
- The production API deliberately returns HTTP 501 for `/api/network/devices/*` live operations. Inventory is not a live connection.
- The production Worker has no RouterOS TCP/API-SSL client. Cloudflare Workers should not be used as a raw TCP client to a private LAN router.
- Target device: MikroTik RB750Gr3 / hEX, RouterOS 7.25. Target PPPoE mode: existing PPPoE customers.

## Required topology

Use a small always-on connector on the same trusted LAN as the MikroTik:

```
NEXUS browser
    | HTTPS (authenticated tenant API)
Cloudflare Pages + NEXUS Worker + D1
    | queued, signed HTTPS jobs/results (outbound only)
LAN connector (Node.js service on an always-on Linux host)
    | RouterOS API-SSL over LAN, TCP 8729
MikroTik RB750Gr3 / hEX
```

The connector initiates outbound HTTPS to NEXUS; do not expose RouterOS API (8728/8729), Winbox, SSH, or the router management page to the public internet. A phone that is switched off or loses connectivity cannot act as an always-on connector. If no always-on LAN host exists, live integration remains pending.

## Connector identity and transport

- Provision a unique connector ID per ISP tenant and a high-entropy one-time enrollment secret. Store only a hash of the enrollment secret.
- Exchange the enrollment secret for a revocable connector credential. Scope every job and result to connector ID and organization ID.
- Require HTTPS, request timestamp, nonce, and HMAC-SHA256 signature over method + path + timestamp + nonce + body hash. Reject stale timestamps, reused nonces, invalid signatures, and oversized payloads.
- Rotate and revoke connector credentials. Never log credentials, RouterOS passwords, PPP secrets, or full command payloads.
- The connector must not accept inbound internet connections. Use outbound polling or outbound long-poll/WebSocket only.
- Store RouterOS credentials only in the connector's protected local secret store; do not return them to the browser or include them in job payloads.

## RouterOS setup

1. Create a dedicated RouterOS user for NEXUS with the minimum required policy. Start with read-only access.
2. Enable API-SSL only on the trusted LAN interface and restrict it with the RouterOS input firewall to the connector host's LAN IP.
3. Use a valid TLS certificate where feasible and verify the server certificate. Do not disable certificate verification in production.
4. Use TCP 8729 only. Do not use plaintext API TCP 8728 over untrusted networks.
5. Confirm the router's clock, RouterOS 7.25 version, LAN reachability, and API-SSL certificate before pairing.

## First release: read-only commands only

Allow-list only these read-only RouterOS paths initially:

- `/system/identity/print`
- `/system/resource/print`
- `/ppp/active/print`
- `/ppp/secret/print` only if explicitly enabled; redact secret/password fields before returning data.
- `/interface/print` with sensitive fields removed.

The first release must not enable, disable, add, remove, or modify PPP secrets, profiles, interfaces, firewall rules, or router configuration. Do not reboot the router. Return a timestamped connection result and sanitized session metadata; never infer that a customer is online from an old cached result.

## Later write operations (disabled until separately reviewed)

PPPoE provisioning, disconnect, speed/profile changes, and service suspension require a separate explicit approval, tenant permission check, idempotency key, audit record, command allow-list, confirmation UI, and rollback plan. A write operation must never be accepted merely because a caller can access router inventory.

## NEXUS API contract to implement

- `POST /api/connectors/enroll`: owner/admin only; one-time enrollment.
- `POST /api/connectors/heartbeat`: connector-authenticated; reports version and health.
- `POST /api/connectors/jobs/claim`: connector-authenticated; returns only jobs assigned to that connector.
- `POST /api/connectors/jobs/:id/result`: connector-authenticated; validates job ownership, signature, schema and expiry.
- `GET /api/network/status`: tenant-authenticated; returns last contact time, connector status, router identity and freshness indicator.
- `POST /api/network/devices/:id/test`: tenant-authenticated; queues a read-only connectivity test. Return `202 Accepted`, not a fabricated success.

All SQL reads/writes must include `organization_id`; connector credentials must be separate from user JWTs. Every command and result must be audited. Results older than the configured freshness window must be shown as stale/offline/unknown, not online.

## Acceptance tests before production enablement

1. A connector enrolled for tenant A cannot claim or submit tenant B jobs.
2. Invalid, expired, replayed, and unsigned requests are rejected.
3. A connector restart resumes safely without duplicating completed jobs.
4. A router that is unreachable produces a truthful failed test and does not change router configuration.
5. Read-only allow-list rejects every unapproved command and all write commands.
6. PPPoE active-session results are timestamped and sanitized.
7. Credential rotation and connector revocation immediately prevent further polling.
8. Staging tests pass before any production release; production D1 migration is additive and backed up.

## Deployment gate

Do not remove the current HTTP 501 guard or advertise live MikroTik features until a real RB750Gr3 has passed the acceptance tests. Do not deploy an untested connector or alter production D1 data as part of this specification-only change.
