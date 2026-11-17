import sqlite3
from pathlib import Path
sql=Path(__file__).resolve().parents[2]/"cloudflare"/"d1"/"migrations"/"0022_security_hardening.sql"
db=sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL);
CREATE TABLE users(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL);
CREATE TABLE customers(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL);
CREATE TABLE payment_promises(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,customer_id TEXT NOT NULL,amount INTEGER NOT NULL,promise_date TEXT NOT NULL,status TEXT NOT NULL,notes TEXT,created_by TEXT NOT NULL);
INSERT INTO users VALUES('ua','a'),('ub','b');
INSERT INTO customers VALUES('ca','a'),('cb','b');
""")
migration=sql.read_text()
db.executescript(migration)
db.executescript(migration)  # idempotency regression
def add(i,o,c,u):
 db.execute("INSERT INTO payment_promises(id,organization_id,customer_id,amount,promise_date,status,created_by) VALUES(?,?,?,?,?,?,?)",(i,o,c,100,"2026-11-17","open",u))
add("ok","a","ca","ua")
for row in [("bad-customer","a","cb","ua"),("bad-creator","a","ca","ub")]:
 try:add(*row)
 except sqlite3.IntegrityError:pass
 else:raise AssertionError("cross-tenant insert accepted")
try:db.execute("UPDATE payment_promises SET created_by='ub' WHERE id='ok'")
except sqlite3.IntegrityError:pass
else:raise AssertionError("cross-tenant update accepted")
assert db.execute("SELECT id,name FROM schema_migrations").fetchall()==[(22,"0022_security_hardening")]
assert db.execute("SELECT COUNT(*) FROM registration_attempts").fetchone()[0]==0
print("Security migration 0022 idempotency, ledger and tenant-guard tests passed.")
