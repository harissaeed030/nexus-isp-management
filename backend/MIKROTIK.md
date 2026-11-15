# MikroTik RouterOS 7 integration

## Network prerequisites
- RouterOS v7 with API-SSL enabled (TCP 8729); do not expose it to the public internet.
- Permit the NEXUS server address only in the RouterOS firewall.
- Install a dedicated RouterOS group/user with only the required API, read, write and sensitive permissions. Avoid the full-access admin account.
- Use a trusted TLS certificate on the router. NEXUS verifies certificates; do not disable verification in production.
- TCP 8728 is accepted for local development only and is rejected in production.

## Secrets
Generate a 32-byte key: `openssl rand -hex 32`. Set it as `ROUTER_CREDENTIAL_KEY` in the server secret store. Never commit it. Back it up securely; losing it makes stored router credentials unrecoverable. Existing routers need credentials re-entered after enabling this migration.

## API
Authenticated tenant-scoped endpoints live under `/api/v1/routers`: CRUD, `:id/test`, `:id/pppoe/active`, `:id/pppoe/secrets`, `:id/pppoe/profiles`, PPP secret create/update/suspend/restore, `:id/sync`, and `:id/logs`.

Responses from real router calls explicitly carry `source: live`. The mock adapter is test-only and is never used to answer a live request. Credentials are never returned by router inventory or log endpoints.

## Limitations
Customer-to-PPP-secret mapping and automatic customer status reconciliation require an explicit PPP username field on customer records and should be enabled as a separate audited workflow. Router commands are fixed in server code; callers cannot submit RouterOS command paths.
