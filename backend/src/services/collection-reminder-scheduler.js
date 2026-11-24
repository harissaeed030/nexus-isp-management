import { randomUUID } from "node:crypto";
import { withTransaction } from "../lib/transactions.js";

const POLL_MS = 15 * 60 * 1000;
const TEMPLATE_KEYS = /\{\{(name|accountNumber|phone|email|invoiceNumber|amount|dueDate)\}\}/g;

function karachiDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function renderTemplate(body, values) {
  return body.replace(TEMPLATE_KEYS, (_, key) => String(values[key] ?? ""));
}

function templateValues(customer, invoice = null, promise = null) {
  return {
    name: customer.full_name || "",
    accountNumber: customer.account_number || customer.customer_code || "",
    phone: customer.phone || "",
    email: customer.email || "",
    invoiceNumber: invoice?.invoice_number || "",
    amount: String(Math.max(0, Number(invoice?.outstanding_pkr ?? promise?.amount_pkr) || 0)),
    dueDate: invoice?.due_date || promise?.promise_date || ""
  };
}

function enqueueOutbox(db, { tenantId, customerId, phone, template, values, now }) {
  const outboxId = randomUUID();
  const body = renderTemplate(template.body, values);
  const parameters = [...template.body.matchAll(TEMPLATE_KEYS)].map(match => String(values[match[1]] ?? ""));
  db.prepare(`INSERT INTO notification_outbox(
    id,tenant_id,customer_id,template_id,channel,destination,body,
    provider_template_name,language_code,template_parameters,status,next_attempt_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    outboxId, tenantId, customerId, template.id, "whatsapp", phone, body,
    template.provider_template_name, template.language_code, JSON.stringify(parameters),
    "queued", now.toISOString()
  );
  return outboxId;
}

function candidateForInvoice(db, invoiceId, today) {
  return db.prepare(`
    SELECT i.id invoice_id,i.tenant_id,i.customer_id,i.invoice_number,i.amount_pkr,i.due_date,
      c.full_name,c.phone,c.email,c.account_number,c.customer_code,
      i.amount_pkr
       - COALESCE((SELECT SUM(cn.amount_pkr) FROM credit_notes cn WHERE cn.invoice_id=i.id AND cn.tenant_id=i.tenant_id),0)
       - COALESCE((SELECT SUM(p.amount_pkr) FROM payments p WHERE p.invoice_id=i.id AND p.tenant_id=i.tenant_id),0)
       + COALESCE((SELECT SUM(pr.amount_pkr) FROM payment_reversals pr JOIN payments p ON p.id=pr.payment_id AND p.tenant_id=pr.tenant_id WHERE p.invoice_id=i.id AND pr.tenant_id=i.tenant_id),0) outstanding_pkr
    FROM invoices i JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id
    WHERE i.id=? AND i.due_date IS NOT NULL AND date(i.due_date)<=date(?)
      AND c.status='active' AND c.phone IS NOT NULL AND trim(c.phone)<>''
  `).get(invoiceId, today);
}

function queueInvoiceReminders({ db, today, now, logger }) {
  const due = db.prepare("SELECT id FROM invoices WHERE due_date IS NOT NULL AND date(due_date)<=date(?) ORDER BY due_date,created_at").all(today);
  let queued = 0, skipped = 0;
  for (const row of due) {
    try {
      const result = withTransaction(db, () => {
        const invoice = candidateForInvoice(db, row.id, today);
        if (!invoice || Number(invoice.outstanding_pkr) <= 0) return "skipped";
        const eventKey = invoice.due_date < today ? "invoice_overdue" : "invoice_due";
        if (db.prepare("SELECT id FROM notification_reminder_log WHERE tenant_id=? AND invoice_id=? AND event_key=?").get(invoice.tenant_id, invoice.invoice_id, eventKey)) return "skipped";
        const template = db.prepare("SELECT * FROM notification_templates WHERE tenant_id=? AND event_key=? AND channel='whatsapp' AND enabled=1").get(invoice.tenant_id, eventKey);
        if (!template) return "skipped";
        const outboxId = enqueueOutbox(db, {
          tenantId: invoice.tenant_id, customerId: invoice.customer_id, phone: invoice.phone,
          template, values: templateValues(invoice, invoice), now
        });
        db.prepare("INSERT INTO notification_reminder_log(id,tenant_id,invoice_id,event_key,outbox_id,reminder_date) VALUES(?,?,?,?,?,?)")
          .run(randomUUID(), invoice.tenant_id, invoice.invoice_id, eventKey, outboxId, today);
        return "queued";
      });
      if (result === "queued") queued++; else skipped++;
    } catch (error) {
      skipped++;
      logger.error?.("NEXUS invoice reminder enqueue failed", { invoiceId: row.id, error: String(error?.message || error) });
    }
  }
  return { examined: due.length, queued, skipped };
}

function queuePaymentPromiseReminders({ db, today, now, logger }) {
  const promises = db.prepare("SELECT id FROM payment_promises WHERE status='open' AND date(promise_date)<=date(?) ORDER BY promise_date,created_at").all(today);
  let queued = 0, skipped = 0;
  for (const row of promises) {
    try {
      const result = withTransaction(db, () => {
        const promise = db.prepare(`
          SELECT p.id promise_id,p.tenant_id,p.customer_id,p.amount_pkr,p.promise_date,
            c.full_name,c.phone,c.email,c.account_number,c.customer_code
          FROM payment_promises p JOIN customers c ON c.id=p.customer_id AND c.tenant_id=p.tenant_id
          WHERE p.id=? AND p.status='open' AND date(p.promise_date)<=date(?)
            AND c.status='active' AND c.phone IS NOT NULL AND trim(c.phone)<>''
        `).get(row.id, today);
        if (!promise) return "skipped";
        if (db.prepare("SELECT id FROM payment_promise_reminder_log WHERE tenant_id=? AND promise_id=?").get(promise.tenant_id, promise.promise_id)) return "skipped";
        const template = db.prepare("SELECT * FROM notification_templates WHERE tenant_id=? AND event_key='payment_promise_due' AND channel='whatsapp' AND enabled=1").get(promise.tenant_id);
        if (!template) return "skipped";
        const outboxId = enqueueOutbox(db, {
          tenantId: promise.tenant_id, customerId: promise.customer_id, phone: promise.phone,
          template, values: templateValues(promise, null, promise), now
        });
        db.prepare("INSERT INTO payment_promise_reminder_log(id,tenant_id,promise_id,outbox_id,reminder_date) VALUES(?,?,?,?,?)")
          .run(randomUUID(), promise.tenant_id, promise.promise_id, outboxId, today);
        return "queued";
      });
      if (result === "queued") queued++; else skipped++;
    } catch (error) {
      skipped++;
      logger.error?.("NEXUS payment promise reminder enqueue failed", { promiseId: row.id, error: String(error?.message || error) });
    }
  }
  return { examined: promises.length, queued, skipped };
}

export function runCollectionReminderCycle({ db, now = new Date(), logger = console }) {
  const today = karachiDate(now);
  const invoices = queueInvoiceReminders({ db, today, now, logger });
  const promises = queuePaymentPromiseReminders({ db, today, now, logger });
  return {
    examined: invoices.examined + promises.examined,
    queued: invoices.queued + promises.queued,
    skipped: invoices.skipped + promises.skipped,
    invoices,
    paymentPromises: promises,
    reminderDate: today
  };
}

export function startCollectionReminderScheduler({ db, enabled = false, logger = console, now = () => new Date() }) {
  if (!enabled) {
    logger.info?.("NEXUS automatic collection reminders are disabled. Set AUTO_COLLECTION_REMINDERS_ENABLED=true to enable them.");
    return () => {};
  }
  let stopped = false, running = false;
  const tick = () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = runCollectionReminderCycle({ db, now: now(), logger });
      if (result.queued) logger.info?.("NEXUS collection reminders queued", result);
    } catch (error) {
      logger.error?.("NEXUS collection reminder scheduler failed", { error: String(error?.message || error) });
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
