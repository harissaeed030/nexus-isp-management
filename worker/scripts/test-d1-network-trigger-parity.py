#!/usr/bin/env python3
"""Test D1 migration 0026 against production- and staging-shaped SQLite fixtures."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "cloudflare" / "d1" / "migrations" / "0026_network_tenant_and_password_guards.sql"

def expect_rejected(db, sql, params):
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("Expected tenant/password guard to reject the operation")

def fixture(environment):
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE organizations(id TEXT PRIMARY KEY);
      CREATE TABLE users(
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
        password_hash TEXT NOT NULL
      );
      CREATE TABLE network_connectors(
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
        created_by TEXT NOT NULL, status TEXT NOT NULL
      );
      CREATE TABLE network_devices(
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
        device_type TEXT NOT NULL
      );
      CREATE TABLE network_jobs(
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
        connector_id TEXT NOT NULL, device_id TEXT NOT NULL,
        created_by TEXT NOT NULL, status TEXT, created_at TEXT
      );
      CREATE TABLE schema_migrations(
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
      );
      INSERT INTO organizations VALUES ('org-a'), ('org-b');
      INSERT INTO users VALUES ('user-a','org-a','hash-a'), ('user-b','org-b','hash-b');
      INSERT INTO network_devices VALUES
        ('router-a','org-a','mikrotik'), ('router-b','org-b','mikrotik');
    """)
    if environment == "staging":
        # Staging already has these triggers; IF NOT EXISTS must preserve them.
        db.executescript(MIGRATION.read_text(encoding="utf-8"))
        db.execute("DELETE FROM schema_migrations")
    db.executescript(MIGRATION.read_text(encoding="utf-8"))
    return db

def verify(environment):
    db = fixture(environment)
    db.execute(
        "INSERT INTO network_connectors VALUES (?,?,?,?)",
        ("connector-a","org-a","user-a","active"),
    )
    expect_rejected(
        db,
        "INSERT INTO network_connectors VALUES (?,?,?,?)",
        ("connector-bad","org-a","user-b","active"),
    )
    db.execute(
        "INSERT INTO network_jobs VALUES (?,?,?,?,?,?,?)",
        ("job-good","org-a","connector-a","router-a","user-a","queued","2026-11-25"),
    )
    for values in (
        ("job-connector","org-a","missing","router-a","user-a","queued","now"),
        ("job-device","org-a","connector-a","router-b","user-a","queued","now"),
        ("job-creator","org-a","connector-a","router-a","user-b","queued","now"),
    ):
        expect_rejected(
            db,
            "INSERT INTO network_jobs VALUES (?,?,?,?,?,?,?)",
            values,
        )
    expect_rejected(
        db,
        "INSERT INTO users VALUES (?,?,?)",
        ("user-empty","org-a","   "),
    )
    expect_rejected(
        db,
        "UPDATE users SET password_hash=? WHERE id=?",
        ("","user-a"),
    )
    triggers = {row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type='trigger'"
    )}
    assert {
        "trg_network_connectors_tenant_guard",
        "trg_network_jobs_tenant_guard",
        "trg_users_password_hash_insert",
        "trg_users_password_hash_update",
    }.issubset(triggers)
    row = db.execute("SELECT name FROM schema_migrations WHERE id=26").fetchone()
    assert row and row[0] == "0026_network_tenant_and_password_guards"
    db.close()
    print(f"{environment}: migration 0026 tenant/password guards passed")

if __name__ == "__main__":
    verify("production")
    verify("staging")
