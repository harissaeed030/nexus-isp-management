#!/usr/bin/env python3
"""Rehearse D1 migrations 0022–0025 against production/staging-shaped SQLite fixtures."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "cloudflare" / "d1" / "migrations"
ORDER = [
    "0020_allow_workspace_scoped_user_emails.sql",
    "0022_payment_promises.sql",
    "0023_router_credentials_ciphertext.sql",
    "0024_reconcile_deployed_schema_drift.sql",
    "0025_payment_promises_updated_by_guard.sql",
]

BASE_SCHEMA = """
CREATE TABLE organizations(id TEXT PRIMARY KEY);
CREATE TABLE users(
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, email TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff', password_salt TEXT
);
CREATE TABLE customers(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL);
CREATE TABLE network_connectors(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, status TEXT);
CREATE TABLE network_devices(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, device_type TEXT);
CREATE TABLE network_jobs(
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, connector_id TEXT NOT NULL,
 device_id TEXT NOT NULL, status TEXT, created_at TEXT
);
CREATE TABLE router_customer_mappings(
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, router_id TEXT NOT NULL,
 customer_id TEXT NOT NULL, is_online INTEGER
);
CREATE TABLE tr069_devices(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, acs_connection_id TEXT NOT NULL);
CREATE TABLE login_attempts(id TEXT PRIMARY KEY, email TEXT, ip_address TEXT);
CREATE TABLE sync_records(
 id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, table_name TEXT NOT NULL,
 record_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL,
 synced_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sync_worker_failures(id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, sync_id TEXT NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE payment_promises(
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 amount_pkr INTEGER NOT NULL CHECK(amount_pkr>0), promise_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','kept','broken','cancelled')),
 notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 FOREIGN KEY(customer_id) REFERENCES customers(id),
 FOREIGN KEY(created_by) REFERENCES users(id)
);
"""

def make_fixture(environment: str) -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(BASE_SCHEMA)
    db.execute("CREATE UNIQUE INDEX idx_users_org_email_ci ON users(organization_id, lower(email))")
    db.execute("INSERT INTO organizations(id) VALUES ('org-a'),('org-b')")
    db.execute("INSERT INTO users(id,organization_id,email,password_hash) VALUES ('u-a','org-a','owner@example.test','hash-a')")
    second_email = "owner-b@example.test" if environment == "production" else "owner@example.test"
    db.execute(
        "INSERT INTO users(id,organization_id,email,password_hash) VALUES ('u-b','org-b',?,'hash-b')",
        (second_email,),
    )
    db.execute("INSERT INTO customers(id,organization_id) VALUES ('c-a','org-a'),('c-b','org-b')")
    db.execute("INSERT INTO network_devices(id,organization_id,device_type) VALUES ('router-a','org-a','mikrotik')")
    if environment == "production":
        db.execute("CREATE UNIQUE INDEX idx_users_email_global ON users(email)")
        db.execute("CREATE INDEX idx_sync_records_synced_at ON sync_records(tenant_id,table_name,synced_at)")
        db.execute("CREATE INDEX idx_sync_records_tenant_table ON sync_records(tenant_id,table_name,deleted)")
        db.execute("CREATE UNIQUE INDEX idx_sync_records_unique ON sync_records(tenant_id,table_name,record_id)")
        db.execute("CREATE INDEX idx_sync_worker_failures_sync ON sync_worker_failures(tenant_id,sync_id)")
        db.execute("CREATE TABLE sync_state(tenant_id TEXT PRIMARY KEY,last_pull_since TEXT,updated_at TEXT NOT NULL)")
        db.execute("CREATE INDEX idx_login_attempts_email ON login_attempts(email)")
        db.execute("CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address)")
    else:
        db.execute("CREATE INDEX idx_sync_records_synced_at ON sync_records(synced_at)")
        db.execute("CREATE INDEX idx_sync_records_tenant_table ON sync_records(tenant_id,table_name)")
        db.execute("CREATE INDEX idx_sync_records_unique ON sync_records(tenant_id,table_name,record_id)")
        db.execute("CREATE INDEX idx_sync_worker_failures_sync ON sync_worker_failures(sync_id)")
    return db

def apply_migrations(db: sqlite3.Connection) -> None:
    for filename in ORDER:
        db.executescript((MIGRATIONS / filename).read_text(encoding="utf-8"))

def assert_raises_integrity_error(db: sqlite3.Connection, sql: str, params: tuple) -> None:
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("Expected tenant/uniqueness guard to reject the operation")

def verify(environment: str) -> None:
    db = make_fixture(environment)
    apply_migrations(db)

    index_names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "idx_users_email_global" not in index_names
    assert "idx_users_org_email_ci" in index_names
    assert "idx_sync_records_synced_at" in index_names
    assert "idx_sync_records_tenant_table" in index_names
    assert "idx_sync_records_unique" in index_names
    sync_failure_index = db.execute("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_sync_worker_failures_sync'").fetchone()[0]
    assert "tenant_id,sync_id" in sync_failure_index.replace(" ", "")
    assert "idx_network_devices_org_type" in index_names
    assert "idx_router_customer_mappings_org_customer" in index_names
    assert "idx_router_customer_mappings_org_online" in index_names
    for required_index in (
        "idx_login_attempts_email",
        "idx_login_attempts_ip",
        "idx_network_connectors_org_status",
        "idx_network_jobs_connector_queue",
        "idx_network_jobs_org_created",
        "idx_tr069_devices_connection",
        "idx_sync_worker_failures_sync",
    ):
        assert required_index in index_names, f"Missing reconciled index: {required_index}"

    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "router_credentials" in tables
    assert "sync_state" in tables
    columns = {row[1] for row in db.execute("PRAGMA table_info(payment_promises)")}
    assert "updated_by" in columns

    # Same staff email is allowed in different workspaces, but not twice in one workspace.
    db.execute("INSERT INTO users(id,organization_id,email,password_hash) VALUES ('u-a2','org-a','staff@example.test','hash')")
    db.execute("INSERT INTO users(id,organization_id,email,password_hash) VALUES ('u-b2','org-b','staff@example.test','hash')")
    assert_raises_integrity_error(
        db,
        "INSERT INTO users(id,organization_id,email,password_hash) VALUES ('u-a3','org-a','STAFF@example.test','hash')",
        (),
    )

    # A payment promise cannot reference another workspace's customer or updater.
    assert_raises_integrity_error(
        db,
        "INSERT INTO payment_promises(id,organization_id,customer_id,amount_pkr,promise_date,created_by) VALUES(?,?,?,?,?,?)",
        ("promise-bad","org-a","c-b",1000,"2026-12-01","u-a"),
    )
    db.execute(
        "INSERT INTO payment_promises(id,organization_id,customer_id,amount_pkr,promise_date,created_by) VALUES(?,?,?,?,?,?)",
        ("promise-good","org-a","c-a",1000,"2026-12-01","u-a"),
    )
    assert_raises_integrity_error(
        db,
        "UPDATE payment_promises SET updated_by=? WHERE id=?",
        ("u-b","promise-good"),
    )

    # Router credential writes must bind a MikroTik device and actor to the same workspace.
    assert_raises_integrity_error(
        db,
        "INSERT INTO router_credentials(id,organization_id,network_device_id,ciphertext,created_by,updated_by) VALUES(?,?,?,?,?,?)",
        ("cred-bad","org-b","router-a","cipher","u-b","u-b"),
    )

    migration_ids = {row[0] for row in db.execute("SELECT id FROM schema_migrations")}
    assert {14,15,16,17,18,19,20,21,22,23,24,25}.issubset(migration_ids)
    db.close()
    print(f"{environment}: migrations 0022–0025 and tenant/index guards passed")

if __name__ == "__main__":
    verify("production")
    verify("staging")
