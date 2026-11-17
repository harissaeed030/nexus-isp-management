import sqlite3
from pathlib import Path

sql = Path(__file__).resolve().parents[2] / "cloudflare" / "d1" / "migrations" / "0022_security_hardening.sql"
db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT(datetime('now')));
INSERT INTO schema_migrations(id,name) VALUES
 (10,'0010_pppoe_connection_metadata'),
 (11,'0011_sync_staging_with_production'),
 (12,'0012_customer_workspace_compatibility'),
 (13,'0013_subscription_workspace_status'),
 (14,'0014_router_credential_cipher'),
 (15,'0015_network_jobs'),
 (16,'0016_acs_connections'),
 (17,'0017_tr069_devices'),
 (18,'0018_network_connector_scopes'),
 (19,'0019_field_operations'),
 (20,'0020_inventory'),
 (21,'0021_field_operations'),
 (100,'sync_ledger_and_failures_tables');
""")
migration = sql.read_text()
db.executescript(migration)
db.executescript(migration)
assert db.execute("SELECT id,name FROM schema_migrations WHERE id=22").fetchall() == [(22,"0022_security_hardening")]
assert db.execute("SELECT COUNT(*) FROM registration_attempts").fetchone()[0] == 0
indexes = {row[1] for row in db.execute("PRAGMA index_list('registration_attempts')")}
assert {"idx_registration_attempts_ip_time", "idx_registration_attempts_email_time"} <= indexes
assert db.execute("SELECT name FROM schema_migrations WHERE id=14").fetchone()[0] == "0014_router_credential_cipher"
assert db.execute("SELECT name FROM schema_migrations WHERE id=21").fetchone()[0] == "0021_field_operations"
print("Security migration 0022 idempotency and migration-ledger preservation passed.")
