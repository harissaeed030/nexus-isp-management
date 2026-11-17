# NEXUS Network Connector — Staging Setup

**Status:** Code prepared; not deployed and not connected to a physical device.  
**Initial support:** MikroTik RouterOS read-only only.

## Safety and deployment gate

The hosted Worker has a `NETWORK_CONNECTOR_ENABLED` environment flag. Connector registration, job creation and agent polling remain disabled unless the flag is explicitly set for the target Worker environment.

The Worker migration runner automatically applies additive schema migrations on the first API request after a Worker deployment. Therefore:
- Do not deploy this branch to production without a separate approval.
- Use staging and its staging D1 binding first, after explicit approval.
- Do not change Cloudflare secrets or production D1 records as part of this setup.
- Do not run the local agent until the operator explicitly approves a read-only connection to the named lab router.

## Hosted API flow

All user routes require an authenticated owner/admin session unless a narrower role permission is granted.

- `GET /api/v1/network/connectors` — list connectors (token hashes are never returned).
- `POST /api/v1/network/connectors` — create connector; raw token is returned once only.
- `DELETE /api/v1/network/connectors/:id` — disable connector and cancel its pending/claimed jobs.
- `GET /api/v1/network/jobs` — list tenant-scoped jobs.
- `POST /api/v1/network/jobs` — enqueue a supported read-only MikroTik job.
- `GET /api/v1/network/jobs/:id` — inspect one tenant-scoped job.

Connector-only routes use `Authorization: Connector <one-time-token>`:
- `GET /api/v1/network/agent/jobs/next` — claim one pending job with a 60-second lease.
- `POST /api/v1/network/agent/jobs/:id/result` — report completed/failed result.

Only these hosted capabilities are accepted:
- `mikrotik.identity.read`
- `mikrotik.resource.read`
- `mikrotik.interfaces.read`
- `mikrotik.pppoe.sessions.read`

The API rejects write capabilities. Jobs are tenant-scoped, connector-scoped, idempotent, lease-limited and audited. Connector tokens are stored as SHA-256 hashes; result payloads are bounded and secret-like fields are redacted.

## Local connector environment

After a staging connector is registered and a hosted MikroTik inventory record is active, configure the local backend environment. Keep all values in the local `.env`; never commit them to GitHub.

```dotenv
NETWORK_CONNECTOR_API_URL=https://<staging-worker-host>
NETWORK_CONNECTOR_TOKEN=<one-time-token-returned-by-create>
NETWORK_CONNECTOR_LOCAL_TENANT_ID=<local-sqlite-tenant-id>
NETWORK_CONNECTOR_DEVICE_MAP_JSON={"<hosted-network-device-id>":"<local-router-id>"}
ROUTER_CREDENTIAL_KEY=<existing-64-character-hex-key-used-by-local-router-inventory>
```

The device map explicitly pairs each hosted inventory device ID with a local SQLite router ID. The agent loads that router only within the configured local tenant and decrypts credentials using the existing local encrypted credential store.

## Run manually (only after lab approval)

From the backend directory:

```sh
node src/services/network-connector-agent.js
```

The agent:
- requires an HTTPS Worker URL and a valid connector token;
- refuses plaintext RouterOS API port 8728;
- requires TLS certificate validation;
- only calls the read-only MikroTik adapter;
- never sends arbitrary RouterOS commands;
- reports only bounded, redacted results;
- can be stopped with Ctrl+C.

Do not configure a customer router as a lab target. Use a non-production router or a maintenance-approved test window.

## Not included yet

- HSGQ-G04R live reads: vendor API/MIB/CLI and firmware support remain unverified.
- Huawei ONU live reads and provisioning.
- Hosted GenieACS/TR-069 control.
- Any hosted PPPoE create/suspend/restore or router configuration write operation.
- A permanently running production connector service, monitoring/auto-restart and device-specific acceptance.

The connector foundation is ready for review, but this document is not an instruction to enable it or connect a live device without approval.
