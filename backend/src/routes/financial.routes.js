import { withTransaction } from "../lib/transactions.js";

const methods = new Set(["cash", "bank", "jazzcash", "easypaisa", "other"]);
const money = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === "string" ? value.trim() : "";

function invoiceTotals(db, tenantId, invoice) {
  const paid = db.prepare("SELECT COALESCE(SUM(amount_pkr),0) total FROM payments WHERE tenant_id=? AND invoice_id=?").get(tenantId, invoice.id).total;
  const reversed = db.prepare("SELECT COALESCE(SUM(r.amount_pkr),0) total FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE r.tenant_id=? AND p.invoice_id=?").get(tenantId, invoice.id).total;
  const credits = db.prepare("SELECT COALESCE(SUM(amount_pkr),0) total FROM credit_notes WHERE tenant_id=? AND invoice_id=?").get(tenantId, invoice.id).total;
  const netPaid = Number(paid) - Number(reversed);
  return { paid: Number(paid), reversed: Number(reversed), credits: Number(credits), netPaid, outstanding: Math.max(0, Number(invoice.amount_pkr) - Number(credits) - netPaid) };
}

function refreshInvoiceStatus(db, tenantId, invoice) {
  const totals = invoiceTotals(db, tenantId, invoice);
  const adjustedTotal = Math.max(0, Number(invoice.amount_pkr) - totals.credits);
  const status = totals.netPaid >= adjustedTotal ? "paid" : totals.netPaid > 0 ? "partial" : "unpaid";
  db.prepare("UPDATE invoices SET status=? WHERE id=? AND tenant_id=?").run(status, invoice.id, tenantId);
}

export function registerFinancialRoutes(app, { db, auth, id, audit, fail }) {
  app.get("/api/v1/financial/ledger/:customerId", auth, (req, res) => {
    const tenant = req.user.tenant_id, customerId = req.params.customerId;
    const customer = db.prepare("SELECT id,full_name,account_number FROM customers WHERE id=? AND tenant_id=?").get(customerId, tenant);
    if (!customer) return fail(res, 404, "Customer not found.");

    const events = [
      ...db.prepare("SELECT id,invoice_number reference,amount_pkr amount,created_at occurred_at FROM invoices WHERE tenant_id=? AND customer_id=?").all(tenant, customerId).map(x => ({ ...x, eventType: "invoice", direction: "debit" })),
      ...db.prepare("SELECT p.id,i.invoice_number reference,p.amount_pkr amount,p.received_at occurred_at FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id WHERE p.tenant_id=? AND i.customer_id=?").all(tenant, customerId).map(x => ({ ...x, eventType: "payment", direction: "credit" })),
      ...db.prepare("SELECT n.id,i.invoice_number reference,n.amount_pkr amount,n.created_at occurred_at FROM credit_notes n JOIN invoices i ON i.id=n.invoice_id AND i.tenant_id=n.tenant_id WHERE n.tenant_id=? AND i.customer_id=?").all(tenant, customerId).map(x => ({ ...x, eventType: "credit_note", direction: "credit" })),
      ...db.prepare("SELECT r.id,i.invoice_number reference,r.amount_pkr amount,r.created_at occurred_at FROM payment_reversals r JOIN payments p ON p.id=r.payment_id AND p.tenant_id=r.tenant_id JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id WHERE r.tenant_id=? AND i.customer_id=?").all(tenant, customerId).map(x => ({ ...x, eventType: "payment_reversal", direction: "debit" })),
      ...db.prepare("SELECT id,COALESCE(reference,'Unallocated payment') reference,amount_pkr amount,received_at occurred_at FROM unallocated_payments WHERE tenant_id=? AND customer_id=? AND status='unallocated'").all(tenant, customerId).map(x => ({ ...x, eventType: "unallocated_payment", direction: "credit" }))
    ].sort((a,b) => String(a.occurred_at).localeCompare(String(b.occurred_at)) || a.id.localeCompare(b.id));

    let balance = 0;
    const ledger = events.map(event => {
      const amount = Number(event.amount);
      balance += event.direction === "debit" ? amount : -amount;
      return { ...event, amountPkr: amount, balancePkr: balance };
    });
    res.json({ success: true, data: { customer, entries: ledger, balancePkr: balance } });
  });

  app.get("/api/v1/financial/aging", auth, (req, res) => {
    const tenant = req.user.tenant_id, today = new Date().toISOString().slice(0,10);
    const invoices = db.prepare("SELECT i.*,c.full_name customer_name,c.account_number FROM invoices i JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.due_date IS NOT NULL ORDER BY i.due_date").all(tenant);
    const buckets = { "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
    const rows = [];
    for (const invoice of invoices) {
      if (invoice.due_date >= today) continue;
      const outstanding = invoiceTotals(db, tenant, invoice).outstanding;
      if (outstanding <= 0) continue;
      const days = Math.floor((Date.parse(today+"T00:00:00Z") - Date.parse(invoice.due_date+"T00:00:00Z")) / 86400000);
      const bucket = days <= 30 ? "1_30" : days <= 60 ? "31_60" : days <= 90 ? "61_90" : "90_plus";
      buckets[bucket] += outstanding;
      rows.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, customerId: invoice.customer_id, customerName: invoice.customer_name, dueDate: invoice.due_date, daysOverdue: days, outstandingPkr: outstanding, bucket });
    }
    res.json({ success: true, data: { asOf: today, bucketsPkr: buckets, totalOutstandingPkr: Object.values(buckets).reduce((a,b)=>a+b,0), invoices: rows } });
  });

  app.get("/api/v1/credit-notes", auth, (req,res) => {
    res.json({ success:true, data:db.prepare("SELECT n.*,i.invoice_number,c.full_name customer_name FROM credit_notes n JOIN invoices i ON i.id=n.invoice_id AND i.tenant_id=n.tenant_id JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id WHERE n.tenant_id=? ORDER BY n.created_at DESC").all(req.user.tenant_id) });
  });
  app.post("/api/v1/credit-notes", auth, (req,res) => {
    const b=req.body||{},tenant=req.user.tenant_id,invoiceId=text(b.invoiceId),amount=Number(b.amountPkr),reason=text(b.reason);
    if(!invoiceId||!money(amount)||!reason)return fail(res,400,"Invoice, positive whole-rupee amount and reason are required.");
    const invoice=db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=?").get(invoiceId,tenant);
    if(!invoice)return fail(res,404,"Invoice not found.");
    const totals=invoiceTotals(db,tenant,invoice);
    if(amount>totals.outstanding)return fail(res,409,"Credit note exceeds the remaining invoice balance.");
    const noteId=id();
    try{
      withTransaction(db,()=>{
        db.prepare("INSERT INTO credit_notes(id,tenant_id,invoice_id,amount_pkr,reason,created_by) VALUES(?,?,?,?,?,?)").run(noteId,tenant,invoiceId,amount,reason.slice(0,1000),req.user.id);
        audit(req.user,"create","credit_note",noteId);
      });
    }catch(e){if(String(e.message).includes("credit notes exceed"))return fail(res,409,"Credit note exceeds the invoice total.");throw e;}
    res.status(201).json({success:true,data:db.prepare("SELECT * FROM credit_notes WHERE id=? AND tenant_id=?").get(noteId,tenant)});
  });

  app.get("/api/v1/payment-reversals", auth, (req,res) => {
    res.json({success:true,data:db.prepare("SELECT r.*,p.invoice_id,i.invoice_number,c.full_name customer_name FROM payment_reversals r JOIN payments p ON p.id=r.payment_id AND p.tenant_id=r.tenant_id JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id WHERE r.tenant_id=? ORDER BY r.created_at DESC").all(req.user.tenant_id)});
  });
  app.post("/api/v1/payment-reversals", auth, (req,res) => {
    const b=req.body||{},tenant=req.user.tenant_id,paymentId=text(b.paymentId),amount=Number(b.amountPkr),reason=text(b.reason);
    if(!paymentId||!money(amount)||!reason)return fail(res,400,"Payment, positive whole-rupee amount and reason are required.");
    const payment=db.prepare("SELECT * FROM payments WHERE id=? AND tenant_id=?").get(paymentId,tenant);
    if(!payment)return fail(res,404,"Payment not found.");
    const reversed=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) total FROM payment_reversals WHERE tenant_id=? AND payment_id=?").get(tenant,paymentId).total;
    if(amount>Number(payment.amount_pkr)-Number(reversed))return fail(res,409,"Reversal exceeds the remaining payment amount.");
    const reversalId=id();
    try{
      withTransaction(db,()=>{
        db.prepare("INSERT INTO payment_reversals(id,tenant_id,payment_id,amount_pkr,reason,created_by) VALUES(?,?,?,?,?,?)").run(reversalId,tenant,paymentId,amount,reason.slice(0,1000),req.user.id);
        const invoice=db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=?").get(payment.invoice_id,tenant);
        if(invoice)refreshInvoiceStatus(db,tenant,invoice);
        audit(req.user,"create","payment_reversal",reversalId);
      });
    }catch(e){if(String(e.message).includes("reversals exceed"))return fail(res,409,"Reversal exceeds the original payment amount.");throw e;}
    res.status(201).json({success:true,data:db.prepare("SELECT * FROM payment_reversals WHERE id=? AND tenant_id=?").get(reversalId,tenant)});
  });

  app.get("/api/v1/unallocated-payments", auth, (req,res) => {
    res.json({success:true,data:db.prepare("SELECT u.*,c.full_name customer_name FROM unallocated_payments u JOIN customers c ON c.id=u.customer_id AND c.tenant_id=u.tenant_id WHERE u.tenant_id=? ORDER BY u.received_at DESC").all(req.user.tenant_id)});
  });
  app.post("/api/v1/unallocated-payments", auth, (req,res) => {
    const b=req.body||{},tenant=req.user.tenant_id,customerId=text(b.customerId),amount=Number(b.amountPkr),method=text(b.method||"cash").toLowerCase(),reference=text(b.reference)||null;
    if(!customerId||!money(amount)||!methods.has(method))return fail(res,400,"Customer, positive whole-rupee amount and valid payment method are required.");
    if(!db.prepare("SELECT id FROM customers WHERE id=? AND tenant_id=?").get(customerId,tenant))return fail(res,404,"Customer not found.");
    const paymentId=id();
    withTransaction(db,()=>{
      db.prepare("INSERT INTO unallocated_payments(id,tenant_id,customer_id,amount_pkr,method,reference,created_by) VALUES(?,?,?,?,?,?,?)").run(paymentId,tenant,customerId,amount,method,reference,req.user.id);
      audit(req.user,"create","unallocated_payment",paymentId);
    });
    res.status(201).json({success:true,data:db.prepare("SELECT * FROM unallocated_payments WHERE id=? AND tenant_id=?").get(paymentId,tenant)});
  });
  app.post("/api/v1/unallocated-payments/:id/allocate", auth, (req,res) => {
    const tenant=req.user.tenant_id,unallocated=db.prepare("SELECT * FROM unallocated_payments WHERE id=? AND tenant_id=?").get(req.params.id,tenant),invoiceId=text(req.body?.invoiceId);
    if(!unallocated)return fail(res,404,"Unallocated payment not found.");
    if(unallocated.status!=="unallocated")return fail(res,409,"Payment has already been allocated.");
    const invoice=db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=? AND customer_id=?").get(invoiceId,tenant,unallocated.customer_id);
    if(!invoice)return fail(res,404,"Invoice not found for this customer.");
    if(Number(unallocated.amount_pkr)>invoiceTotals(db,tenant,invoice).outstanding)return fail(res,409,"Payment exceeds the remaining invoice balance.");
    const paymentId=id();
    try{
      withTransaction(db,()=>{
        db.prepare("INSERT INTO payments(id,tenant_id,invoice_id,amount_pkr,method,reference) VALUES(?,?,?,?,?,?)").run(paymentId,tenant,invoice.id,unallocated.amount_pkr,unallocated.method,unallocated.reference);
        db.prepare("UPDATE unallocated_payments SET status='allocated',allocated_invoice_id=? WHERE id=? AND tenant_id=? AND status='unallocated'").run(invoice.id,unallocated.id,tenant);
        refreshInvoiceStatus(db,tenant,invoice);
        audit(req.user,"allocate","unallocated_payment",unallocated.id);
      });
    }catch(e){if(String(e.message).includes("payment exceeds"))return fail(res,409,"Payment exceeds the adjusted invoice balance.");throw e;}
    res.status(201).json({success:true,data:db.prepare("SELECT * FROM payments WHERE id=? AND tenant_id=?").get(paymentId,tenant)});
  });
  app.get("/api/v1/financial/reconciliation", auth, (req,res) => {
    const tenant=req.user.tenant_id;
    const invoices=db.prepare("SELECT * FROM invoices WHERE tenant_id=? ORDER BY created_at DESC").all(tenant);
    const statusMismatches=[];
    for(const invoice of invoices){
      const totals=invoiceTotals(db,tenant,invoice);
      const adjustedTotal=Math.max(0,Number(invoice.amount_pkr)-totals.credits);
      const expected=totals.netPaid>=adjustedTotal?"paid":totals.netPaid>0?"partial":"unpaid";
      if(invoice.status!==expected)statusMismatches.push({invoiceId:invoice.id,invoiceNumber:invoice.invoice_number,storedStatus:invoice.status,expectedStatus:expected,outstandingPkr:totals.outstanding});
    }
    const unallocatedPayments=db.prepare("SELECT u.id,u.customer_id,c.full_name customer_name,u.amount_pkr,u.method,u.reference,u.received_at FROM unallocated_payments u JOIN customers c ON c.id=u.customer_id AND c.tenant_id=u.tenant_id WHERE u.tenant_id=? AND u.status='unallocated' ORDER BY u.received_at").all(tenant);
    const unallocatedTotalPkr=unallocatedPayments.reduce((sum,row)=>sum+Number(row.amount_pkr),0);
    const duplicateReferences=db.prepare("SELECT transaction_ref,COUNT(*) count FROM payments WHERE tenant_id=? AND transaction_ref IS NOT NULL AND trim(transaction_ref)<>'' GROUP BY transaction_ref HAVING COUNT(*)>1").all(tenant);
    res.json({success:true,data:{checkedInvoices:invoices.length,statusMismatches,unallocatedPayments,unallocatedTotalPkr,duplicatePaymentReferences:duplicateReferences,hasDiscrepancies:statusMismatches.length>0||unallocatedPayments.length>0||duplicateReferences.length>0}});
  });

  app.get("/api/v1/reports/financial", auth, (req,res) => {
    const tenant=req.user.tenant_id,today=new Date().toISOString().slice(0,10);
    const from=text(req.query.from)||today.slice(0,8)+"01",to=text(req.query.to)||today;
    const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T00:00:00Z"));
    if(!validDate(from)||!validDate(to)||from>to)return fail(res,400,"Valid from/to dates in YYYY-MM-DD order are required.");
    const sum=(table,column,dateColumn)=>Number(db.prepare("SELECT COALESCE(SUM("+column+"),0) total FROM "+table+" WHERE tenant_id=? AND date("+dateColumn+") BETWEEN date(?) AND date(?)").get(tenant,from,to).total);
    const billedPkr=sum("invoices","amount_pkr","created_at");
    const collectedPkr=sum("payments","amount_pkr","received_at");
    const reversedPkr=sum("payment_reversals","amount_pkr","created_at");
    const creditNotesPkr=sum("credit_notes","amount_pkr","created_at");
    const outstandingPkr=db.prepare("SELECT * FROM invoices WHERE tenant_id=?").all(tenant).reduce((total,invoice)=>total+invoiceTotals(db,tenant,invoice).outstanding,0);
    const unallocatedPaymentsPkr=Number(db.prepare("SELECT COALESCE(SUM(amount_pkr),0) total FROM unallocated_payments WHERE tenant_id=? AND status='unallocated'").get(tenant).total);
    res.json({success:true,data:{currency:"PKR",from,to,billedPkr,collectedPkr,reversedPkr,netCollectedPkr:collectedPkr-reversedPkr,creditNotesPkr,outstandingPkr,unallocatedPaymentsPkr}});
  });

}
