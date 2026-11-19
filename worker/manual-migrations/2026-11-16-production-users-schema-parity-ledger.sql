-- Run only against nexus-saas-db after staging schema parity migration 0011
-- has passed a disposable D1 restore rehearsal and has been applied successfully.
-- Production users already has the exact strict table definition and all three
-- required indexes; this records the shared migration ledger without rebuilding it.
INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(11,'0011_users_strict_schema_parity',datetime('now'));
