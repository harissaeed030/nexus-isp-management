# Nexus — ISP Management Platform

**Professional multi-ISP operations platform** for FTTH providers.

Nexus is being developed as a modular platform for managing subscribers, internet packages, billing, payments, support tickets, network equipment and multiple ISP tenants from one secure system.

> Current status: **Foundation / Phase 1**. The repository currently contains the product blueprint and a responsive frontend prototype. It is not yet production-ready and does not connect to live MikroTik, OLT, ONU or ACS equipment.

## Product goals
- Multi-tenant architecture: each ISP's data is isolated.
- Customer and subscription lifecycle management.
- Packages, invoices, payments and payment history.
- MikroTik integration through a secure server-side adapter (RouterOS API).
- OLT/ONU inventory and device status; vendor-specific integrations added incrementally.
- TR-069 / GenieACS integration through an ACS adapter.
- Complaints, support tickets, field operations and audit logs.
- Mobile-first admin experience.

## Technology direction
- Frontend: responsive HTML/CSS/JavaScript prototype; later React/TypeScript if needed.
- API: Node.js + TypeScript + Express.
- Database: MongoDB Atlas (managed cloud database).
- Authentication: secure sessions/JWT, role-based access control and tenant scoping.
- Deployment: start with free-tier-compatible services; production hosting and limits must be reviewed before launch.

## Repository structure
```
.
├── index.html
├── assets/
│   ├── css/styles.css
│   └── js/app.js
├── docs/
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
├── .env.example
└── .gitignore
```

## Security rules
- Never commit API keys, passwords, database URLs, router credentials or customer data.
- Keep secrets in environment variables / hosting secret manager.
- Never expose MikroTik, OLT or ACS credentials in browser JavaScript.
- Enforce tenant isolation and authorization in the API, not only in the UI.
- Use HTTPS, input validation, audit logging, backups and least-privilege accounts.

## Development status
- [x] Product foundation and architecture
- [x] Responsive dashboard prototype
- [ ] Backend API and database models
- [ ] Authentication, roles and tenant isolation
- [ ] Customer, package and subscription modules
- [ ] Billing and payment ledger
- [ ] MikroTik adapter
- [ ] OLT/ONU inventory and vendor adapters
- [ ] GenieACS / TR-069 adapter
- [ ] Automated tests, monitoring and deployment hardening

## Preview
Open `index.html` in a browser or enable GitHub Pages for a static preview. The current dashboard uses sample data only.

## License
All rights reserved until a license is added. Do not assume this project is open source for reuse or resale.
