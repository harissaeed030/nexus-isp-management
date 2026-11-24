import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { processNotificationBatch } from "../src/services/notification-delivery-worker.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE notification_outbox(
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, destination TEXT NOT NULL, body TEXT NOT NULL,
      provider_template_name TEXT, language_code TEXT, template_parameters TEXT,
      status TEXT NOT NULL DEFAULT 'queued', provider_message_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5, next_attempt_at TEXT, last_error TEXT, provider_status TEXT,
      sent_at TEXT, delivered_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const insert = db.prepare("INSERT INTO notification_outbox(id,tenant_id,destination,body) VALUES(?,?,?,?)");
  insert.run("n1", "tenant-a", "+923001112233", "Hello one");
  insert.run("n2", "tenant-b", "+923001112244", "Hello two");
  return db;
}
const env = { whatsappAccessToken: "test-token", whatsappPhoneNumberId: "phone-id", whatsappApiVersion: "v23.0" };
const okFetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  assert.equal(body.messaging_product, "whatsapp");
  return { ok: true, json: async () => ({ messages: [{ id: "wamid-" + body.to, message_status: "accepted" }] }) };
};

test("delivery worker sends due notifications and keeps tenant rows separate", async () => {
  const db = fixture();
  const result = await processNotificationBatch({ db, env, fetchImpl: okFetch, logger: { error() {} } });
  assert.deepEqual(
    { processed: result.processed, sent: result.sent, retried: result.retried, failed: result.failed },
    { processed: 2, sent: 2, retried: 0, failed: 0 }
  );
  const rows = db.prepare("SELECT tenant_id,status,attempts,provider_message_id FROM notification_outbox ORDER BY id").all();
  assert.equal(rows[0].tenant_id, "tenant-a");
  assert.equal(rows[0].status, "sent");
  assert.equal(rows[0].attempts, 1);
  assert.equal(rows[0].provider_message_id, "wamid-923001112233");
  assert.equal(rows[1].tenant_id, "tenant-b");
  assert.equal(rows[1].status, "sent");
  db.close();
});

test("provider failures are retried and become terminal at max_attempts", async () => {
  const db = fixture();
  db.prepare("UPDATE notification_outbox SET max_attempts=1 WHERE id='n1'").run();
  const result = await processNotificationBatch({
    db, env, logger: { error() {} },
    fetchImpl: async () => ({ ok: false, json: async () => ({ error: { message: "temporary provider outage" } }) })
  });
  assert.equal(result.failed, 1);
  assert.equal(result.retried, 1);
  const rows = db.prepare("SELECT id,status,attempts,last_error FROM notification_outbox ORDER BY id").all();
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].attempts, 1);
  assert.match(rows[0].last_error, /temporary provider outage/);
  assert.equal(rows[1].status, "retry");
  assert.equal(rows[1].attempts, 1);
  db.close();
});

test("worker does not claim or alter messages when WhatsApp credentials are missing", async () => {
  const db = fixture();
  const result = await processNotificationBatch({ db, env: {}, fetchImpl: async () => { throw new Error("must not call provider"); } });
  assert.equal(result.processed, 0);
  assert.equal(result.skipped, "WhatsApp credentials are not configured.");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE status='queued'").get().n, 2);
  db.close();
});

test("stale sending claims are recovered after a worker restart", async () => {
  const db = fixture();
  db.prepare("UPDATE notification_outbox SET status='sending',attempts=1,updated_at='2000-01-01 00:00:00' WHERE id='n1'").run();
  const result = await processNotificationBatch({ db, env, fetchImpl: okFetch, logger: { error() {}, warn() {} }, limit: 1 });
  assert.equal(result.recovered, 1);
  assert.equal(result.sent, 1);
  assert.equal(db.prepare("SELECT status FROM notification_outbox WHERE id='n1'").get().status, "sent");
  db.close();
});
