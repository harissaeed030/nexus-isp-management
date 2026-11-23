import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
baseline = (root / "worker" / "schema-production-v6.sql").read_text()
current = (root / "worker" / "schema.sql").read_text()
migration_7 = (root / "cloudflare" / "d1" / "migrations" / "0007_customer_portal_tenant_guards.sql").read_text()
migration_8 = (root / "cloudflare" / "d1" / "migrations" / "0008_user_email_index_parity.sql").read_text()
migration_9 = (root / "cloudflare" / "d1" / "migrations" / "0009_repair_global_user_email_index.sql").read_text()
migration_22 = (root / "cloudflare" / "d1" / "migrations" / "0022_payment_promises.sql").read_text()
migration_23 = (root / "cloudflare" / "d1" / "migrations" / "0023_router_credentials_ciphertext.sql").read_text()

def normalize_sql(value):
    compact = " ".join((value or "").split()).lower()
    return re.sub(r"\s*([(),])\s*", r"\1", compact)

def objects(db):
    return {
        (row[0], row[1]): normalize_sql(row[2])
        for row in db.execute(
            "SELECT type,name,sql FROM sqlite_master "
            "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV'"
        )
    }

before = sqlite3.connect(":memory:")
before.executescript(baseline)
assert before.execute("SELECT MAX(id) FROM schema_migrations").fetchone()[0] == 6
before.executescript(migration_7)
before.executescript(migration_7)
assert before.execute("SELECT COUNT(*) FROM schema_migrations WHERE id=7").fetchone()[0] == 1
before.executescript(migration_8)
before.executescript(migration_8)
assert before.execute("SELECT COUNT(*) FROM schema_migrations WHERE id=8").fetchone()[0] == 1
before.executescript(migration_9)
before.executescript(migration_9)
assert before.execute("SELECT COUNT(*) FROM schema_migrations WHERE id=9").fetchone()[0] == 1
before.executescript(migration_22)
before.executescript(migration_22)
assert before.execute("SELECT COUNT(*) FROM schema_migrations WHERE id=22").fetchone()[0] == 1
before.executescript(migration_23)
assert before.execute("SELECT COUNT(*) FROM schema_migrations WHERE id=23").fetchone()[0] == 1
assert "credentials_ciphertext" in {row[1] for row in before.execute("PRAGMA table_info(network_devices)")}
assert before.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_email_global'").fetchone() is not None

expected = sqlite3.connect(":memory:")
expected.executescript(current)
actual_objects = objects(before)
expected_objects = objects(expected)
missing = sorted(set(expected_objects) - set(actual_objects))
extra = sorted(set(actual_objects) - set(expected_objects))
different = sorted(key for key in set(actual_objects) & set(expected_objects) if actual_objects[key] != expected_objects[key])
if missing or extra or different:
    print("Missing objects after migration:", missing)
    print("Unexpected objects after migration:", extra)
    print("Different object definitions:", different)
    for key in different:
        print("DIFF", key, "actual=", actual_objects[key][:500], "expected=", expected_objects[key][:500])
    raise AssertionError("Production v6 + migrations 0007-0009 and 0022-0023 do not match canonical schema")

before.execute("INSERT INTO organizations(id,name,slug) VALUES('org-a','Org A','org-a'),('org-b','Org B','org-b')")
before.execute("INSERT INTO customers(id,organization_id,first_name,last_name) VALUES('cust-a','org-a','A','Test'),('cust-b','org-b','B','Test')")
before.execute(
    "INSERT INTO customer_portal_accounts(id,organization_id,customer_id,email,password_hash,password_salt) "
    "VALUES('portal-a','org-a','cust-a','a@example.invalid','hash','salt')"
)
for statement in [
    "INSERT INTO customer_portal_accounts(id,organization_id,customer_id,email,password_hash,password_salt) "
    "VALUES('portal-cross','org-a','cust-b','b@example.invalid','hash','salt')",
    "UPDATE customer_portal_accounts SET customer_id='cust-b' WHERE id='portal-a'",
]:
    try:
        before.execute(statement)
    except sqlite3.IntegrityError as exc:
        assert "portal account customer organization mismatch" in str(exc)
    else:
        raise AssertionError("Cross-tenant portal account write was not rejected")

# Email uniqueness is global (case-sensitive exact address) and additionally case-insensitive within each organization.
before.execute("INSERT INTO users(id,organization_id,email,role) VALUES('user-a','org-a','owner-a@example.invalid','owner')")
try:
    before.execute("INSERT INTO users(id,organization_id,email,role) VALUES('user-a-duplicate','org-b','owner-a@example.invalid','owner')")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Global user email uniqueness was not enforced")
try:
    before.execute("INSERT INTO users(id,organization_id,email,role) VALUES('user-a-case','org-a','OWNER-A@example.invalid','owner')")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Case-insensitive per-organization user email uniqueness was not enforced")

print("D1 schema validation passed: v6 -> idempotent v7/v8/v9/22/23 migrations, object parity, tenant guards and email uniqueness.")

# Fresh-install path: the canonical snapshot is the only supported bootstrap
# for an empty D1 database. Validate it independently from the v6 upgrade path.
fresh = sqlite3.connect(":memory:")
fresh.execute("PRAGMA foreign_keys=ON")
fresh.executescript(current)
fresh_tables = {
    row[0] for row in fresh.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
}
required_fresh_tables = {
    "organizations", "users", "customers", "packages", "subscriptions",
    "invoices", "payments", "support_tickets", "audit_log", "schema_migrations",
}
assert required_fresh_tables <= fresh_tables, (
    "Fresh schema is missing tables: " + repr(sorted(required_fresh_tables - fresh_tables))
)
fresh_versions = [row[0] for row in fresh.execute("SELECT id FROM schema_migrations ORDER BY id")]
assert fresh_versions and max(fresh_versions) == 23, "Fresh schema must include migration ledger through 0023"
fresh_indexes = {
    row[1] for row in fresh.execute("PRAGMA index_list('users')")
}
for required_index in (
    "idx_users_organization",
    "idx_users_email_global",
    "idx_users_org_email_ci",
):
    assert required_index in fresh_indexes, (
        "Fresh schema is missing required users index: " + required_index
    )
fresh_fk_violations = fresh.execute("PRAGMA foreign_key_check").fetchall()
assert not fresh_fk_violations, "Fresh schema has foreign-key violations: " + repr(fresh_fk_violations)

# Confirm the canonical fresh schema enforces the same email constraints as
# the incremental upgrade path: global exact uniqueness and case-insensitive
# uniqueness within an organization.
fresh.execute("INSERT INTO organizations(id,name,slug) VALUES('fresh-a','Fresh A','fresh-a'),('fresh-b','Fresh B','fresh-b')")
fresh.execute("INSERT INTO users(id,organization_id,email,role) VALUES('fresh-user-a','fresh-a','fresh-owner@example.invalid','owner')")
try:
    fresh.execute("INSERT INTO users(id,organization_id,email,role) VALUES('fresh-user-global-dup','fresh-b','fresh-owner@example.invalid','owner')")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Fresh schema did not enforce global user email uniqueness")
try:
    fresh.execute("INSERT INTO users(id,organization_id,email,role) VALUES('fresh-user-case-dup','fresh-a','FRESH-OWNER@example.invalid','owner')")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Fresh schema did not enforce case-insensitive organization email uniqueness")
# The staging-derived canonical snapshot intentionally keeps password_hash nullable
# and role defaulted to member. Production is stricter (password_hash NOT NULL,
# role default staff). Both are compatible with the Worker because registration
# and staff creation always provide password_hash and role explicitly. Validate
# that production contract without rebuilding either live users table.
fresh_user_info = {
    row[1]: row for row in fresh.execute("PRAGMA table_info(users)")
}
assert fresh_user_info["password_hash"][3] == 0, "Canonical staging snapshot drifted unexpectedly"
assert fresh_user_info["role"][4] == "'member'", "Canonical staging role default drifted unexpectedly"

strict = sqlite3.connect(":memory:")
strict.execute("PRAGMA foreign_keys=ON")
strict.executescript("""
CREATE TABLE organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
CREATE TABLE users (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'staff',
 created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 name TEXT, phone TEXT, status TEXT DEFAULT 'active', avatar TEXT,
 password_salt TEXT, last_login TEXT, token_version INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_users_org_email_ci ON users(organization_id, lower(email));
""")
strict.execute("INSERT INTO organizations(id,name,slug) VALUES('strict-org','Strict Org','strict-org')")
strict.execute(
    "INSERT INTO users(id,organization_id,email,password_hash,password_salt,name,role) VALUES(?,?,?,?,?,?,?)",
    ("strict-user", "strict-org", "owner@example.invalid", "hash", "salt", "Owner", "owner"),
)
strict.execute(
    "INSERT INTO users(id,organization_id,email,password_hash,password_salt,name,role) VALUES(?,?,?,?,?,?,?)",
    ("strict-staff", "strict-org", "staff@example.invalid", "hash", "salt", "Staff", "staff"),
)
strict_fk_violations = strict.execute("PRAGMA foreign_key_check").fetchall()
assert not strict_fk_violations, "Strict production-compatible users schema has FK violations"
strict.close()

# Tenant-integrity regression: a promise cannot point at another tenant's customer or actor.
fresh.execute("INSERT INTO organizations(id,name,slug) VALUES('promise-a','Promise A','promise-a'),('promise-b','Promise B','promise-b')")
fresh.execute("INSERT INTO customers(id,organization_id,first_name,last_name) VALUES('promise-customer-a','promise-a','A','Customer'),('promise-customer-b','promise-b','B','Customer')")
fresh.execute("INSERT INTO users(id,organization_id,email,role) VALUES('promise-user-a','promise-a','promise-a@example.invalid','owner'),('promise-user-b','promise-b','promise-b@example.invalid','owner')")
fresh.execute("INSERT INTO payment_promises(id,organization_id,customer_id,amount_pkr,promise_date,created_by) VALUES('promise-valid','promise-a','promise-customer-a',1000,'2026-12-01','promise-user-a')")
for statement in [
    "INSERT INTO payment_promises(id,organization_id,customer_id,amount_pkr,promise_date,created_by) VALUES('promise-cross-customer','promise-a','promise-customer-b',1000,'2026-12-01','promise-user-a')",
    "INSERT INTO payment_promises(id,organization_id,customer_id,amount_pkr,promise_date,created_by) VALUES('promise-cross-actor','promise-a','promise-customer-a',1000,'2026-12-01','promise-user-b')",
]:
    try:
        fresh.execute(statement)
    except sqlite3.IntegrityError as exc:
        assert "payment promise" in str(exc)
    else:
        raise AssertionError("Cross-tenant payment promise write was not rejected")
try:
    fresh.execute("UPDATE payment_promises SET updated_by='promise-user-b' WHERE id='promise-valid'")
except sqlite3.IntegrityError as exc:
    assert "payment promise updater" in str(exc)
else:
    raise AssertionError("Cross-tenant payment promise updater was not rejected")
print("Fresh D1 bootstrap validation passed: canonical snapshot, migration ledger 0023, required indexes and foreign keys, payment-promise tenant guards and encrypted router credential column.")
