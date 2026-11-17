# ADR-001: Hosted network-control scope

- **Status:** Accepted for the current hosted SaaS milestone
- **Date:** 2026-11-17

## Decision

The hosted Cloudflare Pages + Worker + D1 product will expose network-device and OLT/ONU inventory only. It will not claim to provision or control live MikroTik routers, HSGQ OLTs, Huawei ONUs, ACS servers, or TR-069 devices in this milestone.

The local Node.js + SQLite runtime remains the integration track for MikroTik, OLT/ONU adapters and GenieACS/TR-069 experimentation. Local integration state is not automatically synchronized to hosted D1.

## Rationale

- Inventory CRUD is useful without storing privileged router/ACS credentials in the hosted database.
- Live control requires vendor-specific compatibility, credential encryption/rotation, command authorization, audit trails, timeouts, rollback behavior and access to authorized non-production hardware.
- The current project is developed and tested locally on Android/Termux before any separately approved hosted integration.
- A visible “not implemented / local integration” state is safer than controls that appear operational but cannot execute device actions.

## Consequences

- Hosted UI must label router/OLT/ONU records as inventory, not live telemetry or provisioning.
- Hosted ACS/TR-069 controls must remain hidden or explicitly unavailable; do not accept ACS secrets or show fake device actions.
- Local adapter tests may validate their own mocked protocol behavior, but do not prove compatibility with a real RB750Gr3, HSGQ-G04R, Huawei ONU or ACS.
- Any future hosted network-control proposal requires a separate design review covering encrypted secrets, least-privilege commands, tenant isolation, audit events, rate limits, vendor capability checks and non-production hardware acceptance.

## Out of scope

This decision does not close real-device acceptance, TR-069 interoperability, or production security review. Those remain release gates.
