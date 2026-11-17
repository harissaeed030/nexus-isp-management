import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const migrationPattern = /\['(network_connectors(?:\.[^']+)?|network_jobs(?:\.[^']+)?|network_jobs)',"([^"]+)"\]/g;
const migrations = [...source.matchAll(migrationPattern)];
assert.ok(migrations.length >= 4, "Expected connector and job schema migrations to be present.");

function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE organizations(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL); CREATE TABLE network_devices(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, device_type TEXT NOT NULL, name TEXT, status TEXT);");
  db.exec("INSERT INTO organizations(id) VALUES('org-a'),('org-b')");
  db.exec("INSERT INTO users(id,organization_id) VALUES('user-a','org-a'),('user-b','org-b')");
  db.exec("INSERT INTO network_devices(id,organization_id,device_type,name,status) VALUES('router-a','org-a','mikrotik','Router A','active'),('router-b','org-b','mikrotik','Router B','active'),('olt-a','org-a','olt','OLT A','active')");
  for (const match of migrations) db.exec(match[2]);
  return db;
}

test("network connector/job migrations execute on SQLite and create tenant guards", () => {
  const db = makeDb();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('network_connectors','network_jobs')").get().n, 2);
  db.close();
});

test("connector creator must belong to the connector organization", () => {
  const db = makeDb();
  assert.throws(() => db.prepare("INSERT INTO network_connectors(id,organization_id,name,token_hash,created_by) VALUES('c1','org-a','Connector','hash','user-b')").run(), /creator tenant mismatch/i);
  db.close();
});

test("network job cannot cross connector/device/user tenant boundaries", () => {
  const db = makeDb();
  db.prepare("INSERT INTO network_connectors(id,organization_id,name,token_hash,created_by) VALUES('c1','org-a','Connector','hash-a','user-a')").run();
  assert.throws(() => db.prepare("INSERT INTO network_jobs(id,organization_id,connector_id,device_id,capability,idempotency_key,created_by) VALUES('j1','org-a','c1','router-b','mikrotik.identity.read','key-0001','user-a')").run(), /device tenant mismatch/i);
  assert.throws(() => db.prepare("INSERT INTO network_jobs(id,organization_id,connector_id,device_id,capability,idempotency_key,created_by) VALUES('j2','org-a','c1','olt-a','mikrotik.identity.read','key-0002','user-a')").run(), /unsupported type/i);
  assert.throws(() => db.prepare("INSERT INTO network_jobs(id,organization_id,connector_id,device_id,capability,idempotency_key,created_by) VALUES('j3','org-b','c1','router-b','mikrotik.identity.read','key-0003','user-b')").run(), /connector tenant mismatch/i);
  db.close();
});

test("job idempotency is unique per organization", () => {
  const db = makeDb();
  db.prepare("INSERT INTO network_connectors(id,organization_id,name,token_hash,created_by) VALUES('c1','org-a','Connector','hash-a','user-a')").run();
  db.prepare("INSERT INTO network_jobs(id,organization_id,connector_id,device_id,capability,idempotency_key,created_by) VALUES('j1','org-a','c1','router-a','mikrotik.identity.read','key-0001','user-a')").run();
  assert.throws(() => db.prepare("INSERT INTO network_jobs(id,organization_id,connector_id,device_id,capability,idempotency_key,created_by) VALUES('j2','org-a','c1','router-a','mikrotik.identity.read','key-0001','user-a')").run(), /unique/i);
  db.close();
});
