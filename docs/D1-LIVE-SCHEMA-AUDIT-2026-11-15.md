# NEXUS live D1 schema audit — 2026-11-15

## Outcome

Migration 0008 is applied to production and staging. Index parity is complete. The two databases are not yet byte-for-byte schema-identical because their legacy users table definitions differ. No production table rebuild was attempted.

## Environments and backups

| Environment | D1 database | Migration ledger | Pre-change export |
|---|---|---:|---|
| Production | nexus-saas-db | 8 | Completed; bookmark 00000098-00000000-00005124-c54409adce6ceb3d0f8df19215df65df |
| Staging | nexus-saas-staging-db | 8 | Completed; bookmark 0000005e-0000000c-00005124-3bfa769fc30258ed74eb2814df7718a8 |

The export download URLs are temporary and were not committed to Git.

## Migration 0008 operations

Before applying the indexes, both databases were checked for duplicate exact email values and case-insensitive email collisions. No duplicates were found. The additive migration was applied to staging first and then production:

- idx_users_organization
- idx_users_email_global (unique)
- idx_users_org_email_ci (unique on organization ID and lowercased email)
- schema_migrations row 8: 0008_user_email_index_parity

Staging negative tests confirmed that a duplicate exact email and a same-organization case-insensitive duplicate are rejected by the database.

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
| organizations | 1 | 3 |
| users | 1 | 3 |
| customers | 0 | 4 |
| invoices | 0 | 2 |
| payments | 0 | 0 |
| customer portal accounts | 0 | 4 |

Staging contains synthetic QA data. Production customer tables are empty at the time of this audit.

## Runtime checks

- GitHub backend verification passed, including local backend tests and D1 migration snapshot validation.
- Staging tenant-isolation/customer-portal E2E passed after the D1 export operations completed.
- Live smoke verification passed for production, staging, and the Pages frontend after the export operations completed.
- The earlier transient HTTP 500s were caused by Cloudflare D1 rejecting Worker queries while a long-running export was active. The exports completed; rerun checks passed.
- No production customer, invoice, payment, or identity records were changed by the migration. Production user count remained 1.

## Remaining work

1. Decide whether to preserve the stricter production users schema or standardize both databases with a separately reviewed rebuild.
2. If standardizing, implement a backup-backed migration with foreign-key dependency checks, a staging rehearsal, and post-migration identity/login tests.
3. Complete real MikroTik, HSGQ OLT, Huawei ONU, and TR-069 hardware tests; these require access to the user's physical network equipment.
