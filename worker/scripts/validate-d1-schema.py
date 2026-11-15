import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
baseline = (root / "worker" / "schema-production-v6.sql").read_text()
current = (root / "worker" / "schema.sql").read_text()
migration_7 = (root / "cloudflare" / "d1" / "migrations" / "0007_customer_portal_tenant_guards.sql").read_text()
migration_8 = (root / "cloudflare" / "d1" / "migrations" / "0008_user_email_index_parity.sql").read_text()
migration_9 = (root / "cloudflare" / "d1" / "migrations" / "0009_repair_global_user_email_index.sql").read_text()

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
    raise AssertionError("Production v6 + migration 0007 does not match canonical v7 schema")

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

print("D1 schema validation passed: v6 -> idempotent v7/v8/v9 migrations, object parity, tenant guards and email uniqueness.")
