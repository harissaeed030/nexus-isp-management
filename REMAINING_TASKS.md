# NEXUS Remaining Tasks / Release Gates

## High priority
- [ ] Run fresh live production + staging smoke workflow and retain run URL/output.
- [ ] Verify API health response and D1 readiness from an external networked runner.
- [ ] Complete staging admin-module E2E for all core CRUD and billing/payment flows.
- [ ] Add/complete tenant isolation tests across every relevant API route.
- [ ] Verify refund/payment idempotency under concurrent requests.
- [ ] Verify CSV injection protections on every export.
- [ ] Complete D1 integrity checks and a backup restore rehearsal.
- [ ] Reconcile local Node/SQLite backend with Cloudflare Worker/D1 architecture.
- [ ] Configure and test production vs preview frontend API base selection.

## Network integration
- [ ] Implement and test the local MikroTik agent.
- [ ] Configure outbound-only Cloudflare Tunnel; keep router management ports private.
- [ ] Test RouterOS API-SSL against a real router and test PPPoE subscriber.
- [ ] Obtain HSGQ-G04R API documentation and test OLT/ONU operations.
- [ ] Verify Huawei ONU inform and provisioning against the real ACS/GenieACS instance.

## Documentation / acceptance
- [ ] Record full route/role security matrix.
- [ ] Record staging E2E test run IDs and outcomes.
- [ ] Record production live smoke run ID and outcome for each release.
- [ ] Obtain Vancom production customer acceptance before migrating real customer records.

## Completed/verified baseline
- [x] Pages project connected to the repository with production branch `main`.
- [x] Latest canonical Pages production deployment reports success.
- [x] Production and staging Worker scripts exist.
- [x] Worker D1 bindings point to separate production and staging databases.
- [x] Required Worker secret bindings are present (values not exposed).
- [x] Production Worker version 22 is deployed at 100% traffic.
- [x] Production and staging D1 both record migrations 0001–0007.
- [x] Both D1 databases have matching 23-table / 83-index / 24-trigger object counts.
- [x] Production customer and financial records were preserved; no reset or destructive migration was run.

Do not mark the SaaS fully production-certified until all unchecked release gates are completed.
