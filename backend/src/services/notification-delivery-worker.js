import { withTransaction } from "../lib/transactions.js";

const MAX_BATCH = 10;
const POLL_MS = 30_000;
const STALE_MINUTES = 5;

async function sendWhatsApp(env, notification, fetchImpl) {
  const version = env.whatsappApiVersion || "v23.0";
  const response = await fetchImpl(
    "https://graph.facebook.com/" + version + "/" + encodeURIComponent(env.whatsappPhoneNumberId) + "/messages",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.whatsappAccessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(notification.destination).replace(/[^0-9]/g, ""),
        ...(notification.provider_template_name
          ? {
              type: "template",
              template: {
                name: notification.provider_template_name,
                language: { code: notification.language_code || "en_US" },
                ...(notification.template_parameters
                  ? {
                      components: [{
                        type: "body",
                        parameters: JSON.parse(notification.template_parameters).map(text => ({ type: "text", text: String(text) }))
                      }]
                    }
                  : {})
              }
            }
          : { type: "text", text: { preview_url: false, body: notification.body } })
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "WhatsApp provider rejected the message (HTTP " + response.status + ").");
  }
  const messageId = payload.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp provider returned no message ID.");
  return { messageId, providerStatus: payload.messages?.[0]?.message_status || "accepted" };
}

function claimNext(db) {
  return withTransaction(db, () => {
    const now = new Date().toISOString();
    const item = db.prepare(
      "SELECT * FROM notification_outbox WHERE status IN ('queued','retry') AND attempts<max_attempts AND (next_attempt_at IS NULL OR julianday(next_attempt_at)<=julianday(?)) ORDER BY COALESCE(next_attempt_at,created_at),created_at LIMIT 1"
    ).get(now);
    if (!item) return null;
    const claimed = db.prepare(
      "UPDATE notification_outbox SET status='sending',attempts=attempts+1,updated_at=? WHERE id=? AND tenant_id=? AND status=? AND attempts<max_attempts"
    ).run(now, item.id, item.tenant_id, item.status);
    if (!claimed.changes) return null;
    return db.prepare("SELECT * FROM notification_outbox WHERE id=? AND tenant_id=?").get(item.id, item.tenant_id);
  });
}

function recoverStaleClaims(db) {
  return db.prepare(
    "UPDATE notification_outbox SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'retry' END,next_attempt_at=CURRENT_TIMESTAMP,last_error=COALESCE(last_error,'Delivery worker restarted during send; retrying may cause a duplicate if the provider accepted the previous request.'),updated_at=CURRENT_TIMESTAMP WHERE status='sending' AND julianday(updated_at)<julianday('now',?)"
  ).run("-" + STALE_MINUTES + " minutes").changes;
}

export async function processNotificationBatch({ db, env, fetchImpl = fetch, logger = console, limit = MAX_BATCH }) {
  if (!env.whatsappAccessToken || !env.whatsappPhoneNumberId) {
    return { processed: 0, sent: 0, retried: 0, failed: 0, skipped: "WhatsApp credentials are not configured." };
  }
  const recovered = recoverStaleClaims(db);
  let processed = 0, sent = 0, retried = 0, failed = 0;
  const max = Math.max(1, Math.min(MAX_BATCH, Number.isInteger(limit) ? limit : MAX_BATCH));
  while (processed < max) {
    const item = claimNext(db);
    if (!item) break;
    processed++;
    try {
      const result = await sendWhatsApp(env, item, fetchImpl);
      db.prepare(
        "UPDATE notification_outbox SET status='sent',provider_message_id=?,provider_status=?,sent_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='sending'"
      ).run(result.messageId, result.providerStatus, item.id, item.tenant_id);
      sent++;
    } catch (error) {
      const terminal = item.attempts >= item.max_attempts;
      const status = terminal ? "failed" : "retry";
      const delaySeconds = Math.min(3600, 30 * (2 ** Math.min(Math.max(item.attempts - 1, 0), 7)));
      const message = String(error?.message || error || "Unknown provider error").slice(0, 500);
      db.prepare(
        "UPDATE notification_outbox SET status=?,next_attempt_at=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='sending'"
      ).run(status, new Date(Date.now() + delaySeconds * 1000).toISOString(), message, item.id, item.tenant_id);
      if (terminal) failed++; else retried++;
      logger.error?.("NEXUS notification delivery failed", { notificationId: item.id, tenantId: item.tenant_id, attempts: item.attempts, status, error: message });
    }
  }
  if (recovered) logger.warn?.("NEXUS recovered stale notification claims", { count: recovered });
  return { processed, sent, retried, failed, recovered };
}

export function startNotificationDeliveryWorker({ db, env, enabled = false, logger = console, fetchImpl = fetch }) {
  if (!enabled) {
    logger.info?.("NEXUS automatic WhatsApp delivery is disabled. Set AUTO_NOTIFICATIONS_ENABLED=true to enable it.");
    return () => {};
  }
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await processNotificationBatch({ db, env, fetchImpl, logger });
      if (result.processed) logger.info?.("NEXUS notification delivery batch", result);
    } catch (error) {
      logger.error?.("NEXUS notification delivery worker tick failed", { error: String(error?.message || error) });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, POLL_MS);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
