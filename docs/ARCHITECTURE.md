# Nexus Architecture

## 1. System boundaries
Nexus is a multi-tenant SaaS application. A platform operator manages ISP tenants. Each tenant manages its own staff, customers, service plans, subscriptions, invoices, payments, support cases and network inventory.

## 2. Initial domain modules
- Identity: users, roles, permissions, sessions.
- Tenancy: ISP organizations, tenant settings, subscription plans.
- CRM: customers, contacts, addresses and service locations.
- Catalog: internet packages, speed profiles and prices.
- Provisioning: subscriptions, service state and activation workflow.
- Finance: invoices, payment records, adjustments and ledger entries.
- Network: routers, OLTs, PON ports, ONUs/ONTs and service mappings.
- ACS: GenieACS device inventory, parameter reads and approved actions.
- Support: complaints, tickets, assignments and status history.
- Audit: actor, tenant, action, target and timestamp.

## 3. Tenant isolation
Every tenant-owned record must include tenantId. Every API request must derive the authorized tenant from the authenticated identity and verify access on the server. Never trust a tenantId supplied by the browser alone. Add database indexes beginning with tenantId where appropriate. Automated tests must prove that one tenant cannot read or modify another tenant's records.

## 4. Integration design
Browser -> Nexus API -> Integration adapter -> vendor/service.

The browser must never communicate directly with routers, OLTs or ACS using privileged credentials. Each adapter has explicit timeouts, validation, authorization, logging and safe error handling. Begin with read-only status and inventory operations. Add write/provisioning operations only after device-specific testing and confirmation flows.

## 5. Security baseline
- Password hashing with a modern password-hashing algorithm.
- Secure, HttpOnly, SameSite cookies or carefully configured short-lived tokens.
- Role-based access control and tenant scoping on every endpoint.
- Rate limiting, request validation and CSRF protection where applicable.
- Secrets in environment variables or a managed secret store.
- Redacted logs; never log passwords, tokens or full customer secrets.
- HTTPS, database backups, restore tests and dependency updates.

## 6. Delivery stages
1. Static UX prototype and product requirements.
2. API skeleton, database connection and health checks.
3. Authentication, tenants, roles and audit trail.
4. Customers, packages, subscriptions and billing.
5. MikroTik read-only adapter, then controlled provisioning.
6. OLT/ONU inventory and vendor-specific support.
7. GenieACS integration and approved TR-069 workflows.
8. Tests, observability, backup/restore and production review.

## 7. Important limitations
This repository's initial dashboard is a visual prototype with sample values. It does not currently store customer records, issue real invoices, change router configurations or control ONUs. Do not use it for live ISP operations until backend security, data integrity and device integration tests are complete.
