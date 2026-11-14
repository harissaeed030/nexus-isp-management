# NEXUS Production Deployment Guide (v1.0.0 candidate)

## Release gate

**Do not deploy this candidate to production yet.** The repository is an early SQLite-backed core, not a fully verified production SaaS. Deployment is blocked until all Critical/High security findings are closed and the complete release checklist is signed off.

## Supported deployment shape for the current code

- One Node.js application instance on Node.js 22.13+.
- One persistent, private local filesystem volume for SQLite.
- A trusted HTTPS reverse proxy / platform TLS termination in front of the app.
- No public exposure of the SQLite file, backup directory, environment files or Node inspector.
- Do not run multiple app replicas against a local SQLite file. For multi-instance SaaS, first move to a server database with tenant-safe constraints and a tested migration plan.
- Do not host production on an Android/Termux phone.

## Required production environment

Set values in the hosting provider's secret/environment manager. Do not commit real values.

```dotenv
NODE_ENV=production
PORT=4000
SQLITE_PATH=/var/lib/nexus/nexus.sqlite
SQLITE_BACKUP_DIR=/var/backups/nexus
CORS_ORIGINS=https://app.example.com
```

The production configuration rejects missing origins, non-HTTPS origins and relative database paths. Replace the example hostname with the real frontend origin. Never use localhost origins in production.

## Build and verify

```sh
cd backend
npm ci
npm run verify
npm run migrate
npm run backup
npm start
```

The repository currently has no verified deployment artifact or signed image. Build from the reviewed release branch/commit only after CI passes.

## HTTPS and headers

Terminate TLS at a trusted reverse proxy or managed hosting platform. Redirect HTTP to HTTPS at that layer and enable HSTS there after confirming the hostname is HTTPS-only. Express Helmet supplies baseline security headers; keep the proxy's forwarded-header configuration restricted to the trusted proxy. Do not set `trust proxy` broadly without knowing the network topology.

## Health and monitoring

- Liveness/readiness: `GET /api/v1/health` (database integrity probe included).
- Application logs are structured JSON and must be shipped to a private log sink with access controls and retention.
- Never log Authorization headers, passwords, request bodies, customer names, phone numbers, addresses, invoice values or device credentials.
- Alert on process restarts, non-2xx spikes, failed health checks, disk pressure, backup failures and SQLite integrity errors.
- Keep monitoring data free of customer identifiers.

## Backups and recovery

Run `npm run backup` from the backend directory. The script uses SQLite's online-consistent `VACUUM INTO` snapshot, restrictive file permissions and `PRAGMA quick_check`.

Schedule it with the host's scheduler (example: daily at 02:00 UTC):

```cron
0 2 * * * cd /opt/nexus/backend && npm run backup
```

The scheduler, off-host copy, encryption-at-rest, retention and restore drills must be configured by the hosting operator. Keep backups outside the web root and on storage protected separately from the application host.

Restore procedure:

1. Stop the app and confirm no process has the database open.
2. Preserve the failed database for forensic review; do not overwrite it.
3. Copy the selected verified backup to a new file on the persistent data volume.
4. Run `sqlite3 restored.sqlite 'PRAGMA integrity_check;'` (or the equivalent Node check) and require `ok`.
5. Set `SQLITE_PATH` to the restored file, start the app, verify health and tenant-scoped read/write checks, then reopen service.
6. Record the restore time, backup identifier and operator in the incident log.

## Rollback

1. Put the service into maintenance mode and stop writes.
2. Roll back the application to the previous reviewed commit/artifact.
3. If the schema changed, restore the pre-deployment database backup; do not assume old code can read a newer schema.
4. Verify integrity, health, authentication, tenant boundaries, invoices/payments and audit logs.
5. Reopen traffic only after the rollback checklist passes.

## Limitations that block public SaaS release

The current code uses local SQLite and a single-instance process. It does not yet prove global-unique identity semantics across tenants, hardened browser session storage, multi-instance consistency, production-grade backup scheduling, restore automation, full browser E2E, or live MikroTik/OLT/ACS integrations. The dashboard also contains planned modules that are not connected to real APIs. These must not be advertised as operational.
