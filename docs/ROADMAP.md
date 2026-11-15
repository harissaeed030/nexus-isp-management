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
- [ ] Scheduled recurring billing and automated collection reminders.
- [ ] CSV exports and complete invoice/receipt document workflow.

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

## Phase 6 — SaaS readiness
- [x] Tenant-scoped API design, permission checks and audit logging foundations.
- [x] Database backup/restore utilities and integrity safeguards.
- [x] Automated verification suite and CI on the integrated development branch (GitHub Actions passed on the PR head and merge commit; live acceptance remains separate).
- [ ] Tenant-isolation and independent security review.
- [ ] Production storage, HTTPS, secrets, firewall and monitoring configuration.
- [ ] Backup/restore rehearsal using a copy of the intended production database.
- [ ] Android browser acceptance and operational usability review.
- [ ] Production deployment and controlled migration.

**Status rule:** A code module marked complete means its implementation and dashboard/API wiring exist. Automated CI passing does not mean live hardware compatibility, operational acceptance, independent security review or production certification has passed. Those release gates remain explicitly pending.
