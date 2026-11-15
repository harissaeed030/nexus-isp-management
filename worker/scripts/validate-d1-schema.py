import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
baseline = (root / "worker" / "schema-production-v6.sql").read_text()
current = (root / "worker" / "schema.sql").read_text()
migration = (root / "cloudflare" / "d1" / "migrations" / "0007_customer_portal_tenant_guards.sql").read_text()

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
before.executescript(migration)
before.executescript(migration)
assert before.execute("SELECT COUNT(*) FROM schema_migrations WHERE id=7").fetchone()[0] == 1

expected = sqlite3.connect(":memory:")
expected.executescript(current)
assert objects(before) == objects(expected), "Production v6 + migration 0007 does not match canonical v7 schema"

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

print("D1 schema validation passed: v6 -> idempotent v7 migration, object parity, insert/update tenant guards.")
