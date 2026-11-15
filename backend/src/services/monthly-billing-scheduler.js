import { randomUUID } from "node:crypto";

function karachiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

function generateTenantInvoices(db, tenantId, period) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT id FROM billing_runs WHERE tenant_id=? AND billing_period=?").get(tenantId, period)) {
      db.exec("ROLLBACK");
      return { skipped: true, invoicesCreated: 0 };
    }
    const [year, month] = period.split("-").map(Number);
    const dueDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const subscriptions = db.prepare("SELECT s.customer_id,p.monthly_price_pkr FROM subscriptions s JOIN packages p ON p.id=s.package_id AND p.tenant_id=s.tenant_id JOIN customers c ON c.id=s.customer_id AND c.tenant_id=s.tenant_id WHERE s.tenant_id=? AND s.status='active' AND p.status='active' AND c.status='active'").all(tenantId);
    const insert = db.prepare("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,amount_pkr,due_date) VALUES(?,?,?,?,?,?)");
    const nextNumber = db.prepare("INSERT INTO invoice_sequences(tenant_id,billing_period,last_number) VALUES(?,?,1) ON CONFLICT(tenant_id,billing_period) DO UPDATE SET last_number=last_number+1 RETURNING last_number");
    for (const subscription of subscriptions) {
      const sequence = nextNumber.get(tenantId, period);
      const invoiceNumber = "INV-" + period.replace("-", "") + "-" + String(sequence.last_number).padStart(6, "0");
      insert.run(randomUUID(), tenantId, subscription.customer_id, invoiceNumber, subscription.monthly_price_pkr, dueDate);
    }
    const owner = db.prepare("SELECT id FROM users WHERE tenant_id=? AND role='owner' AND status='active' ORDER BY created_at LIMIT 1").get(tenantId);
    db.prepare("INSERT INTO billing_runs(id,tenant_id,billing_period,invoices_created,created_by) VALUES(?,?,?,?,?)").run(randomUUID(), tenantId, period, subscriptions.length, owner?.id || null);
    db.prepare("INSERT INTO audit_logs(id,tenant_id,actor_user_id,action,resource_type,resource_id) VALUES(?,?,?,'scheduled_generate','billing_run',?)").run(randomUUID(), tenantId, owner?.id || null, period);
    db.exec("COMMIT");
    return { skipped: false, invoicesCreated: subscriptions.length };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    if (/UNIQUE constraint failed: billing_runs\.tenant_id, billing_runs\.billing_period/.test(String(error.message))) {
      return { skipped: true, invoicesCreated: 0 };
    }
    throw error;
  }
}

export function startMonthlyBillingScheduler({ db, enabled = false, logger = console }) {
  if (!enabled) {
    logger.info?.("NEXUS automatic monthly billing is disabled. Set AUTO_BILLING_ENABLED=true to enable it.");
    return () => {};
  }
  let stopped = false;
  let running = false;
  let lastAttemptedPeriod = "";
  const tick = () => {
    if (stopped || running) return;
    const local = karachiParts();
    const period = local.year + "-" + local.month;
    const afterSchedule = Number(local.day) > 1 || (local.day === "01" && (Number(local.hour) > 5 || (Number(local.hour) === 5 && Number(local.minute) >= 15)));
    if (!afterSchedule || lastAttemptedPeriod === period) return;
    running = true;
    let completed = true;
    try {
      const tenants = db.prepare("SELECT id FROM tenants WHERE status='active' ORDER BY created_at").all();
      for (const tenant of tenants) {
        try {
          const result = generateTenantInvoices(db, tenant.id, period);
          logger.info?.("NEXUS scheduled billing", { tenantId: tenant.id, period, ...result });
        } catch (error) {
          completed = false;
          logger.error?.("NEXUS scheduled billing failed", { tenantId: tenant.id, period, error: String(error.message || error) });
        }
      }
      if (completed) lastAttemptedPeriod = period;
    } catch (error) {
      logger.error?.("NEXUS monthly billing scheduler tick failed", { period, error: String(error.message || error) });
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
