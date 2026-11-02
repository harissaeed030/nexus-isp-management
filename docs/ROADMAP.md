# Nexus Delivery Roadmap

## Phase 1 — Foundation
- Product identity, repository standards and architecture.
- Mobile-first dashboard prototype.
- Security and integration boundaries.

## Phase 2 — Core backend
- Node.js / TypeScript API.
- MongoDB Atlas connection through environment configuration.
- Health endpoint, structured validation and error handling.
- Tenant, user, role and audit models.

## Phase 3 — ISP operations
- Customer CRUD and service locations.
- Package catalog and subscriptions.
- Invoice generation and payment ledger.
- Complaint/ticket workflow.

## Phase 4 — Network operations
- Router inventory and secure MikroTik adapter.
- OLT / PON / ONU inventory.
- Device-to-customer service mapping.
- Read-only status collection before provisioning.

## Phase 5 — TR-069 / ACS
- GenieACS connection via server-side adapter.
- Device discovery and parameter display.
- Explicitly authorized reboot / configuration actions.
- Vendor compatibility testing.

## Phase 6 — SaaS readiness
- Tenant isolation tests.
- Backups and restore drills.
- Monitoring, rate limits and incident handling.
- Security review and deployment documentation.

Each phase must include tests and documentation before moving production data into the system.
