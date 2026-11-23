# Hosted D1 API compatibility — 2026-11-23

## Purpose

The browser dashboard uses the versioned `/api/v1/*` contract. The hosted Cloudflare Worker uses established `/api/*` handlers. This compatibility layer normalizes paths and supported PATCH requests at the Worker boundary, then uses the same authenticated, organization-scoped D1 handlers.

## Implemented hosted routes

- Setup and dashboard aliases: `/api/v1/setup` and `/api/v1/dashboard`.
- Ticket and router aliases: `/api/v1/tickets/*` to complaints and `/api/v1/routers/*` to network-device inventory.
- Customer profile, financial aging, payment promises and report summary handlers.
- ACS connection management, connection test and device sync.
- TR-069 device list, audit log, parameter reads, diagnostics, reboot and Wi-Fi tasks.
- PATCH-to-PUT normalization for supported customer, package, subscription, complaint, network-device and payment-promise updates.
- Existing OpenAI-powered NEXUS AI chat is retained for owner/admin users.

## Security and operational boundaries

- All customer, invoice, payment, ACS, TR-069 and network-device records remain organization-scoped.
- ACS credentials and router passwords are encrypted at rest using Worker-secret-derived encryption keys; credential plaintext is not returned to the browser.
- ACS endpoints must be public HTTPS endpoints. Private/local endpoints are rejected.
- TR-069 parameter snapshots redact password, passphrase, secret, token, PSK and network-key values.
- Device online status is based on last inform time; a saved ACS URL alone does not prove connectivity.
- Wi-Fi task parameter paths must be selected from the device's discovered parameter list; firmware-specific paths are not guessed.
- Router inventory and encrypted credential storage do not imply live RouterOS/PPPoE provisioning. Live router operations remain dependent on a separately configured network connector.
- No staging-only synthetic tenant cleanup route is included in the production Worker.

## Data and deployment safety

- Production D1 remains the source of truth for hosted SaaS records.
- Local SQLite remains separate; this change does not import or synchronize a local SQLite file.
- No production D1 snapshot replacement is permitted.
- Production Worker deployment and secret changes remain gated on successful CI, staging E2E, and explicit deployment review.
- TR-069 operations require a reachable public HTTPS GenieACS NBI endpoint and valid credentials. No customer ONU is rebooted or reconfigured by a code-only validation.

## Validation

The verification workflow runs the API compatibility tests, backend checks, Worker syntax and production/staging route-isolation checks, D1 schema validation, and existing live-safe smoke tests. Staging E2E must pass against the deployed staging Worker before any production release.
