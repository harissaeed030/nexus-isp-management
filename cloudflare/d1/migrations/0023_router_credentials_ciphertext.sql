-- D1 migration 0023: encrypted RouterOS API credential storage.
-- Additive only. Existing router inventory rows remain intact; their credential
-- state remains unset until an owner rotates credentials through the API.
-- Do not deploy until fresh D1 exports and a schema preflight are complete.

ALTER TABLE network_devices ADD COLUMN credentials_ciphertext TEXT;

INSERT OR IGNORE INTO schema_migrations(id,name,applied_at)
VALUES(23,'0023_router_credentials_ciphertext',datetime('now'));
