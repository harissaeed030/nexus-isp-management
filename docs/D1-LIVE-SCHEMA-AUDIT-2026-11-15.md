# NEXUS live D1 schema audit — 2026-11-15

## Outcome

Migrations 0008 and 0009 are applied to production and staging. Migration 0009 repaired the explicit global user-email unique index that was found missing in production during a follow-up live read. The expected global, organization-scoped case-insensitive, and organization lookup indexes were verified live in both environments. The two databases are not yet byte-for-byte schema-identical because their legacy users table definitions differ. No production table rebuild was attempted.

## Environments and backups

| Environment | D1 database | Migration ledger | Pre-change export |
|---|---|---:|---|
| Production | nexus-saas-db | 9 | Before migration 0008: 00000098-00000000-00005124-c54409adce6ceb3d0f8df19215df65df; before migration 0009: 00000099-00000000-00005124-92593d88a25ddcdb7c0601a037b70004 |
| Staging | nexus-saas-staging-db | 9 | Before migration 0008: 0000005e-0000000c-00005124-3bfa769fc30258ed74eb2814df7718a8; before migration 0009: 0000005f-0000004a-00005124-4ad50938687c5ea3b1975579db530105 |

The export download URLs are temporary and were not committed to Git.

## Migration 0008 operations

Before applying the indexes, both databases were checked for duplicate exact email values and case-insensitive email collisions. No duplicates were found. The additive migration was applied to staging first and then production:

- idx_users_organization
- idx_users_email_global (unique)
- idx_users_org_email_ci (unique on organization ID and lowercased email)
- schema_migrations row 8: 0008_user_email_index_parity

Staging negative tests confirmed that a duplicate exact email and a same-organization case-insensitive duplicate are rejected by the database.

## Migration 0009 follow-up

A subsequent read-only live check found that the explicit global unique index `idx_users_email_global` was still absent in production even though migration 0008 was recorded. A no-duplicate preflight was completed in both databases. Additive migration `0009_repair_global_user_email_index.sql` was then applied to staging and production after fresh exports. Both databases now record migration 9. Live verification confirmed `idx_users_email_global`, `idx_users_org_email_ci`, and `idx_users_organization` in both environments. Migration 0009 does not rebuild `users` or modify user rows.

## Live schema comparison

The live comparison found 99 non-system schema objects in each database:

- No production-only objects.
- No staging-only objects.
- No normalized SQL differences in indexes, triggers, or tables other than users.

### Remaining users table definition difference

| Property | Production | Staging |
|---|---|---|
| ID | TEXT PRIMARY KEY (no default) | TEXT PRIMARY KEY DEFAULT lower(hex(randomblob(16))) |
| password_hash | TEXT NOT NULL | TEXT (nullable) |
| Default role | staff | member |
| Other fields | organization, email, name, phone, status, avatar, salt, last login, token version, timestamps | Same logical fields |

This is a real schema difference, not whitespace formatting. Current Worker user creation paths explicitly supply user ID, password hash, password salt and role, so these code paths do not depend on the differing defaults. The production constraint is stricter than staging and the staging default is more convenient for generated IDs.

A table rebuild was not attempted. Rebuilding users can affect foreign-key dependants (sessions, password resets, permissions, notifications, tickets and audit references) and must be designed with a full restore plan and staging rehearsal. Do not claim complete production/staging table parity until that migration is separately reviewed and executed.

## Live data counts at audit

| Table | Production | Staging |
|---|---:|---:|
| organizations | 1 | 7 |
| users | 1 | 7 |
| customers | 0 | 7 |
| invoices | 0 | 2 |
| payments | 0 | 0 |
| customer portal accounts | 0 | 4 |

Staging contains synthetic QA data. Two synthetic tenants from the first E2E attempt (run 43730835265) remain because their cleanup requests coincided with the long-running D1 export and returned HTTP 500. The later E2E run passed and cleaned its own tenants. These two remaining tenants are staging-only test fixtures, not customer data. Production customer tables are empty at the time of this audit.

## Runtime checks

- Final live recheck after migration 0009 and Worker security deployments confirmed both migration ledgers at version 9, all three expected indexes in both databases, and unchanged production counts (1 organization, 1 user, 0 customers, 0 invoices, 0 payments). Staging had 7 organizations, 7 users, 7 customers, 2 invoices and 0 payments at that recheck.

- GitHub backend verification passed, including local backend tests and D1 migration snapshot validation.
- Staging tenant-isolation/customer-portal E2E passed after the D1 export operations completed.
- Live smoke verification passed for production, staging, and the Pages frontend after the export operations completed.
- The earlier transient HTTP 500s were caused by Cloudflare D1 rejecting Worker queries while a long-running export was active. The exports completed; rerun checks passed.
- No production customer, invoice, payment, or identity records were changed by the migration. Production user count remained 1.

## Remaining work

1. Decide whether to preserve the stricter production users schema or standardize both databases with a separately reviewed rebuild. Index parity is complete at migration 0009; only the `users` table definition remains different.
2. If standardizing, implement a backup-backed migration with foreign-key dependency checks, a staging rehearsal, and post-migration identity/login tests.
3. Complete real MikroTik, HSGQ OLT, Huawei ONU, and TR-069 hardware tests; these require access to the user's physical network equipment.
