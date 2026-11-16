import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/011_pppoe_accounts_and_subscription_lifecycle.sql", import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE tenants(id TEXT PRIMARY KEY);
    CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id));
    CREATE TABLE routers(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id));
    CREATE TABLE customers(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
      pppoe_username TEXT,pppoe_router_id TEXT,status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE subscriptions(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      package_id TEXT,status TEXT,started_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec("INSERT INTO tenants(id) VALUES('tenant-a'),('tenant-b')");
  db.exec("INSERT INTO routers(id,tenant_id) VALUES('router-a','tenant-a'),('router-b','tenant-b')");
  db.exec("INSERT INTO customers(id,tenant_id,pppoe_username,pppoe_router_id,status) VALUES('customer-a','tenant-a','user-a','router-a','active')");
  db.exec("INSERT INTO subscriptions(id,tenant_id,customer_id,package_id,status) VALUES('sub-a','tenant-a','customer-a','package-a','active')");
  return db;
}

test("migration 011 safely normalizes legacy PPPoE mapping and adds subscription lifecycle dates", () => {
  const db = fixture();
  try {
    db.exec(migration);
    const account = db.prepare("SELECT tenant_id,customer_id,router_id,username,status,password_ciphertext FROM pppoe_accounts").get();
    assert.deepEqual(account, {
      tenant_id: "tenant-a",
      customer_id: "customer-a",
      router_id: "router-a",
      username: "user-a",
      status: "active",
      password_ciphertext: null
    });
    assert.ok(db.prepare("SELECT 1 FROM pragma_table_info('subscriptions') WHERE name='expires_at'").get());
    assert.ok(db.prepare("SELECT 1 FROM pragma_table_info('subscriptions') WHERE name='renewed_at'").get());

    assert.throws(() => db.prepare(
      "INSERT INTO pppoe_accounts(id,tenant_id,customer_id,router_id,username) VALUES('bad','tenant-a','customer-a','router-b','bad-user')"
    ).run(), /PPPoE router tenant mismatch/);

    db.prepare(
      "INSERT INTO pppoe_accounts(id,tenant_id,customer_id,router_id,username) VALUES('account-b','tenant-b','customer-b','router-b','user-b')"
    );
    db.exec("INSERT INTO customers(id,tenant_id,status) VALUES('customer-b','tenant-b','active')");
    db.prepare(
      "INSERT INTO pppoe_accounts(id,tenant_id,customer_id,router_id,username) VALUES('account-b','tenant-b','customer-b','router-b','user-b')"
    ).run();
    assert.throws(() => db.prepare(
      "INSERT INTO pppoe_accounts(id,tenant_id,customer_id,username) VALUES('duplicate','tenant-a','customer-a','user-a')"
    ).run(), /UNIQUE constraint failed/);
  } finally {
    db.close();
  }
});
