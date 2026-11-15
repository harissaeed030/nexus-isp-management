# NEXUS MikroTik Setup Guide

## Current verified status
The Cloudflare release is deployed, but live MikroTik operation is **not certified**. The production release record states that no live RouterOS session has been accepted. Inventory records or passing adapter unit tests do not prove that a router is reachable or controllable.

## Required architecture
- A small local agent runs inside the ISP LAN, near the MikroTik router.
- Agent initiates outbound-only connectivity to the NEXUS control plane through Cloudflare Tunnel.
- Do not expose RouterOS API, API-SSL, Winbox, SSH or WebFig ports to the public internet.
- Agent authenticates using a short-lived, revocable device identity.
- Commands are signed, tenant-bound, device-bound, timestamped and idempotent; agent rejects expired/replayed commands.
- Router credentials are stored locally in an OS-protected secret store or encrypted file with restrictive permissions. Never return credentials to the dashboard.
- Agent reports heartbeat, software version, router identity, RouterOS version, API reachability and last command result.
- Every privileged action is audit logged.

## Safe RouterOS preparation
1. Use a dedicated least-privilege RouterOS account for the agent.
2. Enable API-SSL only on the trusted LAN interface and restrict source addresses to the local agent.
3. Use a valid certificate where supported; do not disable certificate checks in production.
4. Keep management services unavailable from WAN.
5. Start with read-only monitoring: identity, resources, PPP active sessions and interface status.
6. Test customer enable/disable and profile changes only on a dedicated test PPP secret.
7. Add rate limits, command allowlists, timeout handling and rollback instructions before enabling customer-impacting actions.

## Acceptance tests required
- Agent enrollment/revocation and tenant/device isolation.
- Outbound Tunnel reconnect after WAN interruption.
- TLS/certificate verification.
- RouterOS API-SSL authentication and timeout handling.
- PPPoE active-session read-only monitoring.
- Test subscriber disable/enable and profile/bandwidth change.
- Duplicate/replayed command rejection.
- Credential-at-rest and log-redaction checks.
- Audit event correlation from dashboard to agent to router.
- Safe recovery when the router is offline or command outcome is unknown.

## Hardware and credentials
Physical verification requires a reachable MikroTik router, RouterOS version, API-SSL enabled on the LAN, a dedicated test user and a test PPPoE account. Do not run service-impacting commands on production subscribers during acceptance.

## OLT/ONU distinction
HSGQ-G04R and Huawei ONU management are separate from MikroTik RouterOS. Do not claim optical telemetry, ONU provisioning or TR-069 success without vendor API/ACS documentation and a real test device. The current release notes leave those hardware acceptance tests open.
