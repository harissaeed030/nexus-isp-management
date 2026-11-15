# Staff roles and permissions

Nexus uses server-side role defaults plus per-user permission overrides. The API checks permissions on every protected request; hiding a dashboard control is not treated as security.

## Default roles

| Role | Default access |
| --- | --- |
| Owner | All workspace permissions; owner account cannot be edited through staff management. |
| Administrator | All workspace modules; only the owner can create or manage administrator accounts. |
| Billing | Dashboard, customer/package/subscription read access, invoice creation, payment recording, monthly invoice generation and financial reports. |
| NOC | Dashboard, customer/package/subscription read access, subscription changes, complaint handling and router inventory management. |
| Support | Dashboard, customer/package/subscription read access and complaint handling. |
| Technician | Dashboard, customer/subscription read access, complaint handling and router inventory read access. |
| Limited staff | Dashboard only until the owner or administrator grants more access. |

## Per-user permissions

Open Staff, choose Permissions beside a staff account, and select the allowed actions. Saving stores only differences from that role's defaults. Changing a staff member's role clears old overrides so the new role starts with its safe defaults.

Permission keys include:

- Dashboard: `dashboard.read`
- Customers: `customers.read`, `customers.create`, `customers.update`, `customers.delete`
- Packages: `packages.read`, `packages.manage`
- Subscriptions: `subscriptions.read`, `subscriptions.manage`
- Billing: `billing.read`, `invoices.create`, `payments.create`, `billing.generate`
- Reports: `reports.read`
- Support: `tickets.read`, `tickets.manage`
- Network: `routers.read`, `routers.manage`
- Administration: `audit.read`

## Safety

- Staff list and permission-management endpoints remain restricted to owner/admin accounts.
- An administrator cannot create, edit or assign the administrator role to another administrator; only the owner can.
- All staff and permission queries are scoped to the authenticated tenant.
- The SQLite change only creates the `user_permissions` table and index if missing. It does not reset or delete existing tables, users, customers, invoices, payments or the local database file.
- The smoke test uses a temporary SQLite file and removes only that temporary test directory.
