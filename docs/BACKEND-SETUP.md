# Nexus backend setup — Node.js and SQLite

The maintained local ISP-management runtime is in `backend/`. It uses Node.js, Express and SQLite through Node's built-in `node:sqlite` module. It does **not** use MongoDB, Mongoose or MongoDB Atlas.

## Requirements

- Node.js 22.13 or newer (Node 26 is supported).
- Android Termux or a desktop/server terminal.
- For Android, keep the repository and private database inside Termux's app storage; do not place the SQLite database in a public shared folder.

## Install and start

From the repository root:

```sh
cd backend
npm install
cp .env.example .env
npm run check
npm test
npm start
```

Open `http://127.0.0.1:4000/` for the dashboard and `http://127.0.0.1:4000/api/v1/health` for the API health response. Use `npm run verify` to run syntax checks and the complete automated test suite.

## Environment configuration

Edit `backend/.env` locally. Never commit it or paste secret values into browser JavaScript, GitHub issues or logs.

- `PORT`: API listen port (default `4000`).
- `NODE_ENV`: set to `production` only after production secrets and HTTPS/network configuration are ready.
- `SQLITE_PATH`: database file path (default `./data/nexus.sqlite`, relative to `backend/`).
- `CORS_ORIGINS`: comma-separated exact browser origins allowed to call the API.
- `ROUTER_CREDENTIAL_KEY`: 32-byte key encoded as 64 hexadecimal characters; required in production to encrypt stored RouterOS credentials.
- `OLT_CREDENTIAL_KEY` and `ACS_CREDENTIAL_KEY`: optional dedicated encryption keys for OLT/ACS credentials where configured; keep secure recovery copies.
- WhatsApp Cloud API settings are optional and must remain server-side: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.

Generate a 32-byte hexadecimal secret with `openssl rand -hex 32`. Back up encryption keys securely. Losing a key can make credentials already encrypted with it unrecoverable.

## First owner setup

The first owner is created once using `POST /api/v1/setup`:

```json
{
  "companyName": "Vancom Networks (Pvt) Ltd.",
  "fullName": "Owner Name",
  "email": "owner@example.com",
  "password": "use-a-long-private-password"
}
```

The API returns a bearer token. Keep it private. Initial setup is locked after the first user is created. Sign in at the dashboard for later sessions. If a local owner password must be reset, use `npm run auth:reset -- owner@example.com` from `backend/`; the command revokes existing sessions.

## Database, migrations and recovery

SQLite is created automatically at `backend/data/nexus.sqlite`. Additive migrations are tracked in `schema_migrations`; do not delete the database to apply an upgrade.

Run from `backend/`:

```sh
npm run db:backup
npm run db:backup -- ./backups/before-upgrade.sqlite
npm run db:restore -- ./backups/before-upgrade.sqlite
```

Stop the API before restoring, keep backups outside Git in private storage, and restart the API after restore. The restore utility validates the backup and retains a pre-restore safety copy. Automated backup tests are not a substitute for a restore rehearsal against a disposable copy of the intended deployment database.

## Deployment boundary and production checklist

This SQLite API and the Cloudflare Worker/D1 deployment are separate runtime tracks in this repository. Do not assume that deploying the `worker/` directory deploys this Node.js API, or that the local SQLite schema is interchangeable with Cloudflare D1. Confirm the intended frontend API base URL and backend runtime before deployment.

Before exposing the SQLite API to real customers:

1. Use a persistent private disk for the SQLite database and backups.
2. Terminate HTTPS at a trusted reverse proxy; do not expose the Node process or SQLite file publicly.
3. Set exact `CORS_ORIGINS`, production encryption keys and all provider secrets in the hosting secret manager.
4. Restrict router/ACS management ports to the server's private network and use least-privilege device accounts.
5. Complete a restore rehearsal, tenant-isolation review, independent security review and Android/browser acceptance test.
6. Configure monitoring, log rotation, backup retention and a tested recovery procedure.

Live MikroTik, HSGQ OLT/ONU, GenieACS/TR-069 and payment-provider acceptance require reachable test systems and authorized credentials. Adapter unit tests do not prove live-device interoperability.