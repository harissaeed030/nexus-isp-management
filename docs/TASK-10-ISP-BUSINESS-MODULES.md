# TASK 10 — ISP Business Modules

All endpoints below are under `/api/v1`. Except health, setup and login, requests require `Authorization: Bearer <token>`. Every query is scoped to the authenticated tenant. Staff access is checked by the API, not by hiding frontend controls.

## Coverage and geography
- `GET|POST /coverage-areas`; `PATCH|DELETE /coverage-areas/:id`
- `GET|POST /locations`; `PATCH|DELETE /locations/:id`
- Location types are `country`, `city`, `locality`, `street`. Parent chain is enforced: country → city → locality → street.

## Applications and field work
- `GET|POST /applications`; `PATCH|DELETE /applications/:id`
- `GET|POST /field-assignments`; `PATCH|DELETE /field-assignments/:id`
- Assignment requires an active technician account in the same tenant and either an application or a customer.
- Application status: pending, approved, rejected, installed, cancelled. Assignment status: assigned, in_progress, completed, cancelled.

## Dealer and recovery
- `GET|POST /partners`; `PATCH|DELETE /partners/:id`
- `GET|POST /recovery-officers`; `PATCH|DELETE /recovery-officers/:id`
- Partner type is dealer or sub_dealer; a sub-dealer must reference a dealer in the same tenant.

## Collections and ledger
- `GET|POST /cash-collections`
- `GET /operator-collections` — totals are computed from recorded receipts, grouped by operator.
- `GET /customers/:id/ledger` — chronological debit/credit entries and calculated balance.
- Cash collection posts an immutable credit to the customer ledger in the same transaction. Financial receipts and ledger entries are append-only to preserve auditability.

## Inventory
- `GET|POST /inventory`; `PATCH|DELETE /inventory/:id`
- `POST /inventory/:id/movements`; `GET /inventory/:id/movements`
- Categories: onu, media_box, router, fiber, splitter, other.
- Quantity cannot be edited directly; use stock_in, stock_out, assigned or adjustment movements. Negative stock is rejected.

## Recharge and notifications
- `POST /recharges` — body: `{ "subscriptionId": "...", "days": 30, "amountPkr": 1500 }`. Amount is optional and defaults to the assigned package monthly price. Creates an invoice, posts a customer ledger debit and extends subscription expiry atomically. It does not claim payment has been received.
- `GET|POST /notifications`; `PATCH /notifications/:id`
- Notifications are persisted as queued. SMS, WhatsApp and email delivery are not activated without a configured external provider. Do not mark a notification sent until delivery is confirmed externally.
- `GET /business-modules/summary` — real counts only.

## Permission keys
- `areas.read/manage`, `locations.read/manage`, `applications.read/manage`, `field.read/manage`, `partners.read/manage`, `recovery.read/manage`, `collections.read/manage`, `inventory.read/manage`, `notifications.read/manage`, `ledger.read`.
- Recharge uses `subscriptions.manage`.
- Owner/admin retain full access; other staff roles require their role defaults or explicit owner/admin permission grants.

## Operational boundaries
- Cash collections are separate receipts and do not silently settle invoices. Invoice payments remain handled by the existing billing payment workflow.
- A queued notification is not a delivered message. There is no SMS gateway, WhatsApp Business API or email provider configured by this module.
- Inventory serial numbers are optional for bulk items; ONU units can be recorded individually with their serial number.
