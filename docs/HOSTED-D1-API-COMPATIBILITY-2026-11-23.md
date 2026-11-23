# Hosted D1 integration update — 2026-11-23

## Implemented in this branch

### Shared frontend compatibility
- Versioned frontend paths are normalized at the hosted Worker boundary.
- Dashboard response includes the nested `stats` shape.
- Reports summary returns total revenue, six-month revenue series, outstanding receivables and invoice status counts.
- Tickets and network-device inventory paths have explicit aliases.
- Customer create/update accepts the shared frontend camelCase fields while preserving the D1 schema's canonical status values.

### Customer profile
- `GET /api/v1/customers/:id/profile` now returns customer, subscriptions, invoices, payments, complaints, connection history and subscription history.
- Every record lookup and relationship join is scoped to the authenticated organization.
- The response maps D1 column names to the current browser UI contract (full name, speed, monthly price, received date and PKR amount).

### TR-069 / GenieACS
- Added hosted D1 API handlers for ACS connection create/list, test, device sync, device list, audit log list and parameter reads.
- Reboot, diagnostics and Wi-Fi configuration actions are submitted as explicit GenieACS NBI tasks only after an authenticated staff action.
- ACS username/password/bearer token values are encrypted with AES-GCM using a key derived from the Worker JWT secret. Ciphertext is stored in D1; secrets are never returned to the browser.
- ACS base URLs must be HTTPS and public-hostname shaped; local/private HTTP endpoints are rejected.
- Device parameter snapshots and responses redact password, passphrase, secret, token, PSK and network-key values.
- Device online status is derived from the last inform timestamp (10-minute window); a configured ACS URL is not proof of reachability until Test succeeds.
- Added restart-safe table/index creation for ACS, TR-069 and customer-history schema.

## Deliberate operational boundaries

- TR-069 requires a reachable, public HTTPS GenieACS NBI endpoint and valid NBI credentials. No live customer device has been rebooted or reconfigured by this code change.
- Wi-Fi task parameter paths must be supplied from the actual device's discovered parameter list. Firmware-specific parameter names are not guessed.
- RouterOS live provisioning, PPP secret changes and customer profile synchronization are not claimed as supported by the hosted D1 Worker merely because a router inventory row exists.
- The existing production Worker and production D1 records are unchanged by this branch. No production deployment or secret update was performed.
- SQLite-to-D1 data transfer remains separate from hosted API compatibility. No local SQLite backup was available in this work session, so no SQLite rows were imported.

## Validation

- Focused API path, HTTPS ACS URL and secret-redaction tests run in GitHub Actions.
- D1 SQL statements used by customer profile and TR-069 insert/audit paths were checked with read-only `EXPLAIN` against the production schema.
- Existing backend syntax, database hardening, production/staging endpoint and tenant-isolation/customer-portal E2E workflows passed on the current implementation commit.
