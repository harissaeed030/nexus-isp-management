# NEXUS live-readiness audit — 2026-11-27

## Scope and safety

This is a read-only operational audit of the GitHub repository and the connected Cloudflare account. All D1 statements used for this report were SELECT/PRAGMA reads. No Worker deployment, Pages deployment, secret change, D1 write/migration, customer mutation, payment action, or network-device command was performed.

## Verified hosted state

- GitHub repository: `harissaeed030/nexus-isp-management`; production branch is `main`.
- Latest inspected GitHub Actions runs on 2026-11-26: live smoke verification and staging customer-portal E2E both completed successfully.
- Cloudflare Pages project `nexus-isp-management` is Git-connected to `main`. Its latest inspected production deployment succeeded for commit `6f000ed189b15711df5ecd2f4dc10f678c3aabc5` on 2026-11-25.
- Cloudflare Workers `nexus-saas-api` and `nexus-saas-api-staging` both have a latest inspected 100%-traffic deployment annotated for merged PR #112 (password-reset rate-limit isolation), dated 2026-11-24. Worker logs and traces are enabled.
- Password recovery code from PR #109 and the rate-limit isolation follow-up from PR #112 are deployed to production and staging. Email delivery remains unavailable until the owner configures the required Resend API key and verified sender settings; no secret values were read.
- Production and staging D1 databases are separate: `nexus-saas-db` and `nexus-saas-staging-db`.

## Read-only D1 checks

Both databases report 50 tables. A read-only `sqlite_master` comparison returned 115 production schema objects and 116 staging schema objects, with 49 object-definition differences. These include index and table definitions; the schemas must not be treated as fully reconciled.

`PRAGMA foreign_key_check` returned zero violations in both databases.

Selected row counts at audit time:

| Table | Production | Staging |
|---|---:|---:|
| organizations | 1 | 0 |
| users | 1 | 0 |
| customers | 5 | 0 |
| packages | 1 | 0 |
| subscriptions | 1 | 0 |
| invoices | 1 | 0 |
| payments | 1 | 0 |
| support_tickets | 0 | 0 |
| network_connectors | 0 | 0 |
| network_jobs | 0 | 0 |
| password_resets | 0 | 0 |

Production records were only counted, not modified. Staging is empty for the listed application tables, so any staging E2E test must create and clean up its own synthetic data.

The migration ledgers are not identical: production includes migration ID 101, which was not present in the staging ledger during this audit. Do not fabricate ledger rows, replay historical migrations, or rebuild tables merely to force ledger parity.

## Repository integration warning

The development branch `build/nexus-isp-core` and `main` have diverged substantially (compare reported 599 commits ahead and 192 behind for the development branch). Open PR #59 targets `main` with this integration work, but the integration report itself explicitly requires a full reviewed integration and migration rehearsal. Do not merge the old development branch wholesale or force-push either branch.

PR #96 is still open, targets the old `build/nexus-isp-core` branch, reports `mergeable=false`, and its password-hash change explicitly requires a disposable Worker CPU/runtime benchmark before production. It was not merged or deployed by this audit. Do not increase the deployed PBKDF2 work factor based only on source-level tests.

## Remaining release gates

1. **Schema parity and restore:** create fresh verified exports, restore into disposable D1 databases, compare all rows/constraints/indexes/triggers, and document a forward-only reconciliation plan. Cloudflare R2 bucket listing returned error 10042 because R2 is not enabled for this account; a complete R2-backed restore drill cannot currently be verified.
2. **MikroTik:** authorize a lab RB750Gr3 / RouterOS 7 device, configure a trusted always-on LAN connector and credentials, then run read-only acceptance before enabling any write operation. Keep `NETWORK_CONNECTOR_ENABLED=false`.
3. **HSGQ-G04R / Huawei ONU:** obtain official firmware-specific API or SNMP MIB/OID documentation and test credentials for a lab OLT/ONU.
4. **TR-069 / GenieACS:** configure a reachable ACS NBI endpoint, dedicated credentials and a test ONU; an ONU Inform URL alone does not prove NBI connectivity.
5. **Payments:** select a payment provider and complete merchant onboarding; configure server-side credentials before attempting live payment processing.
6. **Android acceptance:** test owner, staff and customer flows on the target Android Chrome/WebView device with non-production test accounts.
7. **Independent security review:** obtain an attributable review of tenant isolation, authentication, password recovery, financial flows and network connector controls.
8. **Email recovery:** configure Resend and a verified sender/domain in both intended environments before claiming email delivery is active.

## Release decision

**Hosted core: deployed and automated smoke/E2E checks passed. Full ISP production certification: NO-GO.**

Do not represent MikroTik/OLT/ONU/TR-069 control, live payment processing, full schema parity, or disaster-recovery restoration as complete until the corresponding release gate has evidence. Preserve production data and keep network writes disabled until lab acceptance passes.
