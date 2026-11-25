# Live D1 schema audit — 2026-11-25

## Scope and safety

Read-only audit of the deployed NEXUS production and staging D1 databases. No SQL writes, schema migrations, Worker deployments, secret changes, or business-record changes were performed during this audit.

A fresh Cloudflare D1 SQL export was requested for each database before considering schema work. Export completion was reported by Cloudflare. A restore rehearsal into a disposable database has not yet been completed, so these exports are not treated as a verified recovery drill.

## Object inventory

| Object type | Production | Staging |
|---|---:|---:|
| Tables | 51 | 51 |
| Indexes | 90 | 90 |
| Triggers | 30 | 34 |

Production and staging have matching table and index counts. The trigger inventories are not identical.

## Trigger drift

The following four triggers exist in staging but are absent in production:

| Trigger | Purpose |
|---|---|
| `trg_network_connectors_tenant_guard` | Rejects connector creation when its creator user does not belong to the same organization |
| `trg_network_jobs_tenant_guard` | Requires an active same-organization connector, a same-organization MikroTik device, and a same-organization creator |
| `trg_users_password_hash_insert` | Rejects a missing or blank password hash on user insert |
| `trg_users_password_hash_update` | Rejects a missing or blank password hash on password-hash update |

The production database has the required `created_by`, `organization_id`, `status`, `connector_id`, and `device_id` columns on the relevant network tables. The password-hash triggers may be redundant with production's stricter column constraint, but the network connector/job guards are meaningful tenant and lifecycle protections.

The remaining 30 shared trigger names match. Three shared definitions differ only in SQL formatting/whitespace; the fourth is the same logical guard with compact formatting. No behavior difference was identified in those formatting-only differences.

## Recommended next migration

Prepare an additive migration (suggested next ID: 0026) that creates the two network tenant guards in production and staging using `CREATE TRIGGER IF NOT EXISTS`. Consider adding the password-hash guards as defense in depth, even though production already enforces NOT NULL. Do not rewrite tables or business rows.

Before applying:
1. Restore the fresh production and staging exports into disposable D1 databases and verify row counts / key records.
2. Run the migration against both disposable restores.
3. Test valid same-organization connector/job creation and rejection of cross-organization creator, connector, and device references.
4. Confirm the application always supplies `created_by` for connector and job inserts.
5. Apply to staging first; verify trigger definitions and smoke tests; then apply to production during a controlled window.
6. Record the migration in `schema_migrations` only after successful verification.

## Other release blockers still open

- Password reset email delivery requires a provider API key and verified sender configuration.
- MikroTik connector must be enabled and tested against a real router on a trusted network.
- HSGQ-G04R / Huawei ONU / TR-069 behavior requires real-device validation.
- Payment gateway credentials and provider approval are not configured.
- Android APK was built successfully by GitHub Actions, but device installation, login, and acceptance testing remain unverified.
- Independent security review and a verified restore drill remain outstanding.

## Android build artifact

GitHub Actions run `45427387690` completed successfully and uploaded `nexus-android-debug-apk`. This is a debug/test build, not a signed Play Store release.

## Conclusion

The deployed app has a successful CI Android build and live backend checks, but it is not yet appropriate to label the entire ISP platform production-complete. The trigger drift and missing external/device integrations must be closed and verified first.
