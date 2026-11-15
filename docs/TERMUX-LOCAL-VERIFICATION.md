# NEXUS — Android Termux final local verification

This guide runs the local Node.js + SQLite development runtime on Android. It does not deploy Cloudflare or connect the local database to production D1.

## 1. Get the intended development branch

If the repository is already cloned:

```sh
cd ~/nexus-isp-management
git fetch origin
git checkout build/nexus-isp-core
git pull --ff-only origin build/nexus-isp-core
```

If it is not cloned:

```sh
cd ~
git clone --branch build/nexus-isp-core https://github.com/harissaeed030/nexus-isp-management.git
cd nexus-isp-management
```

Do not run `git merge main`, `git reset --hard`, or force-push as a shortcut. The branches have diverged; integrate them only through reviewed commits and passing checks.

## 2. Check Termux prerequisites

```sh
node --version
npm --version
git --version
```

The backend requires Node.js 22.13 or newer because it uses the built-in `node:sqlite` module. Node 26 is supported. If Node is older, update Node in Termux before proceeding.

## 3. Install dependencies and prepare local settings

```sh
cd ~/nexus-isp-management/backend
npm install
cp .env.example .env
```

Keep `.env` private. Do not commit it or paste its contents into GitHub.

For a local-only run, the optional integrations can remain unconfigured. Do not enable automatic billing until you have reviewed the invoice rules and tested them with synthetic records. Leave `AUTO_BILLING_ENABLED=false` or unset.

If you intend to test encrypted MikroTik credentials, generate a local key and place it in `.env` as `ROUTER_CREDENTIAL_KEY`:

```sh
openssl rand -hex 32
```

Store the generated key in a private password manager/secure backup. Do not reuse a production key in a test environment.

## 4. Run verification before starting

```sh
npm run check
npm test
```

Or run both with:

```sh
npm run verify
```

A successful result verifies the automated local suite only. It does not verify a physical MikroTik, HSGQ OLT, Huawei ONU, live ACS, payment provider, production D1 or Android browser behavior.

## 5. Start the local app

```sh
npm start
```

Keep this Termux session open. In Android Chrome, open:

- Dashboard: http://127.0.0.1:4000/
- Health: http://127.0.0.1:4000/api/v1/health

Stop the server with Ctrl+C in Termux.

## 6. First login / setup

On a new empty local database, use the first-owner setup screen once. Use your ISP company details and a strong private password. Setup locks after the first owner is created. For an existing local database, use the normal login screen; do not delete `backend/data/nexus.sqlite` to fix a login problem.

## 7. Test the core workflow with synthetic data

1. Sign in as the local owner.
2. Create a test package (use a clearly marked test name).
3. Create a synthetic test customer using a test phone number, not a real customer's private information.
4. Assign the package and activate a test subscription.
5. Generate an invoice for the test customer.
6. Record a small test cash payment and verify the remaining balance.
7. Open the customer financial ledger and invoice/receipt PDF.
8. Test a partial reversal or credit note only against the synthetic test invoice.
9. Create a test support ticket.
10. Check Reports/CSV export and staff permission boundaries.
11. Create an OLT/ONU inventory record and verify it is shown as inventory/configured only; do not interpret it as a live optical connection.
12. Test MikroTik only against a non-production router account and authorized test router.

Do not use real customer, payment or device records for destructive tests.

## 8. Backup and restore rehearsal

From `backend/`:

```sh
npm run db:backup
```

For a restore rehearsal, first stop the server, use a disposable test database/backup copy, and follow the restore script's prompts. Never experiment with restore against the only copy of live customer data.

## 9. Production data boundary

Cloudflare D1 is the authoritative hosted production database. Local SQLite is a separate offline development/test database. There is no automatic SQLite↔D1 synchronization. Do not copy the SQLite file to Cloudflare, run SQLite migrations against D1, or import local test rows into production.

D1 schema changes must use reviewed files under `cloudflare/d1/migrations/` on the production source branch. Existing production D1 databases must never be initialized by replaying `worker/schema.sql`; that snapshot is for a new empty database only.

## 10. Report a test result

When reporting a failure, copy only the command, error text and failing test name. Redact passwords, tokens, API keys, customer phone numbers, router addresses and other private values.
