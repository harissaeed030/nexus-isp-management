# Nexus Delivery Roadmap

## Phase 1 — Foundation
- [x] Product identity, repository standards and architecture.
- [x] Mobile-first dashboard foundation and responsive navigation.
- [x] Security and integration boundaries documented.

## Phase 2 — Core backend
- [x] Node.js API with local SQLite database and additive schema migrations.
- [x] Health endpoint, validation, error handling and rate limiting.
- [x] Tenant, user, role, session and audit models.
- [x] Owner setup, tenant-aware login and staff permission overrides.

## Phase 3 — ISP operations
- [x] Customer CRUD, generated account numbers, service locations and coverage areas.
- [x] Customer search, filters, pagination and profile history.
- [x] Package catalog and subscription assignment, plan changes, renewal, expiry and suspension history.
- [x] Invoice generation, invoice/payment ledger, financial adjustments and summary reports.
- [x] Complaint/ticket workflow and customer portal.
- [x] Coverage areas, new connection applications and application status workflow.
- [x] Dealer/partner records and recovery officer assignments.
- [x] Cash collection records, customer ledger entries and operator attribution.
- [x] Payment promise dates and kept/broken/cancelled follow-up states.
- [x] Geographic country/city/locality hierarchy and field technician assignments.
- [x] Equipment inventory, stock-in/out, assignment and adjustment movements.
- [x] Opt-in scheduled recurring invoice generation (05:15 Asia/Karachi on day 1; tenant-period idempotency and downtime catch-up).
- [ ] Automated collection reminders and scheduled customer notification delivery.
- [x] Tenant-scoped CSV exports for customers, invoices, payments and support tickets.
- [x] Print-ready invoice and receipt views (browser Print / Save as PDF; no server-side PDF binary).

## Phase 4 — Network operations
- [x] Router inventory and encrypted credential storage.
- [x] Server-side MikroTik RouterOS API-SSL adapter and PPPoE operations.
- [x] OLT / PON / ONU inventory and customer service mapping.
- [x] Mobile dashboard screens for OLT and ONU inventory.
- [ ] Verified HSGQ-G04R live management, optical levels and alarms.
- [ ] Live MikroTik device acceptance and customer connection synchronization.

## Phase 5 — TR-069 / ACS
- [x] Server-side GenieACS connection adapter and encrypted ACS credentials.
- [x] Device discovery, parameter display, connection request and queued task endpoints.
- [x] Explicit Wi-Fi parameter writes using discovered device parameter paths.
- [ ] Vendor/model compatibility verification with real ONU devices.
- [ ] Live ACS/ONU acceptance and task-completion confirmation.

## Phase 6 — AI assistant
- [x] Mobile-friendly dashboard chat panel and server-side Gemini API proxy.
- [x] Dedicated staff permission, per-user request throttling, bounded chat history and timeout handling.
- [x] No customer/payment/device data is sent to Gemini; guidance-only safety boundary.
- [ ] Configure a private Gemini API key in the deployment secret store.

## Phase 7 — SaaS readiness
- [x] Tenant-scoped API design, permission checks and audit logging foundations.
- [x] Database backup/restore utilities and integrity safeguards.
- [x] Automated verification suite and CI on the integrated development branch (GitHub Actions passed on the PR head and merge commit; live acceptance remains separate).
- [ ] Tenant-isolation and independent security review.
- [ ] Production storage, HTTPS, secrets, firewall and monitoring configuration.
- [ ] Backup/restore rehearsal using a copy of the intended production database.
- [ ] Android browser acceptance and operational usability review.
- [ ] Production deployment and controlled migration.

## Vancom onboarding inputs and next dependencies
- [x] Record the user-confirmed MikroTik RB750Gr3 / RouterOS 7 model and PPPoE environment.
- [x] Record that Huawei ONUs are reported as connected to an ACS.
- [x] Add a Vancom-specific MikroTik API-SSL and GenieACS NBI onboarding guide.
- [x] Add a blank package catalog CSV template; actual tariff rows await the ISP's full package list.
- [ ] Confirm the exact MikroTik RouterOS patch version, management host, API-SSL certificate trust and restricted API account.
- [ ] Confirm the ACS product and its reachable GenieACS NBI URL / authentication type (an ONU Inform URL is not necessarily the NBI URL).
- [ ] Receive the full Vancom package names, download/upload speeds and monthly PKR prices.
- [ ] HSGQ-G04R official Open API or SNMP MIB/OID documentation.

See [Vancom Network Onboarding](VANCOM-NETWORK-ONBOARDING.md) and [package import template](vancom-package-import-template.csv).

**Status rule:** A code module marked complete means its implementation and dashboard/API wiring exist. Automated CI passing does not mean live hardware compatibility, operational acceptance, independent security review or production certification has passed. Those release gates remain explicitly pending. No tests or live device operations were run for the Vancom onboarding documentation update.
