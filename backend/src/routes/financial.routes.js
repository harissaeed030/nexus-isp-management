import { withTransaction } from "../lib/transactions.js";
import { invoiceBalance, syncInvoiceStatus } from "../lib/financial.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validAmount=v=>Number.isSafeInteger(v)&&v>0;
const html=(title,body)=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>body{font:16px Arial,sans-serif;max-width:760px;margin:32px auto;padding:20px;color:#17221b}h1{color:#176b3a}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}.print{margin:20px 0;padding:10px 18px}@media print{.print{display:none}body{margin:0}}</style></head><body><button class="print" onclick="window.print()">Print / Save as PDF</button><h1>${esc(title)}</h1>${body}</body></html>`;
export function registerFinancialRoutes(app,{db,auth,id,audit,fail}) {
  app.get("/api/v1/customers/:id/ledger",auth,(req,res)=>{
    const t=req.user.tenant_id,c=db.prepare("SELECT id,customer_code,full_name FROM customers WHERE id=? AND tenant_id=?").get(req.params.id,t);
    if(!c)return fail(res,404,"Customer not found.");
    const rows=db.prepare(`SELECT event_id,event_date,event_type,reference,debit_pkr,credit_pkr FROM (
      SELECT i.id event_id,i.created_at event_date,'invoice' event_type,i.invoice_number reference,i.amount_pkr debit_pkr,0 credit_pkr FROM invoices i WHERE i.tenant_id=? AND i.customer_id=?
      UNION ALL SELECT p.id,p.received_at,'payment',COALESCE(p.reference,p.id),0,p.amount_pkr FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.tenant_id=? AND i.customer_id=?
      UNION ALL SELECT r.id,r.created_at,'refund',r.reason,r.amount_pkr,0 FROM payment_reversals r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id WHERE r.tenant_id=? AND i.customer_id=?
      UNION ALL SELECT n.id,n.created_at,'credit_note',n.reason,0,n.amount_pkr FROM credit_notes n JOIN invoices i ON i.id=n.invoice_id WHERE n.tenant_id=? AND i.customer_id=?
    ) ORDER BY event_date,event_id`).all(t,c.id,t,c.id,t,c.id,t,c.id);
    let balance=0;const data=rows.map(x=>{balance+=x.debit_pkr-x.credit_pkr;return {...x,running_balance_pkr:balance};});
    res.json({success:true,data:{customer:c,entries:data,closingBalancePkr:balance}});
  });
  app.post("/api/v1/payments/:id/reversals",auth,(req,res)=>{
    const b=req.body||{},amount=Number(b.amountPkr),reason=String(b.reason||"").trim(),t=req.user.tenant_id;
    if(!validAmount(amount)||reason.length<3)return fail(res,400,"Positive amount and a reason (at least 3 characters) are required.");
    try{const result=withTransaction(db,()=>{
      const payment=db.prepare("SELECT * FROM payments WHERE id=? AND tenant_id=?").get(req.params.id,t);
      if(!payment)throw new Error("PAYMENT_NOT_FOUND");
      const reversed=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM payment_reversals WHERE payment_id=? AND tenant_id=?").get(payment.id,t).n;
      if(amount>payment.amount_pkr-reversed)throw new Error("REVERSAL_EXCEEDS_REMAINING");
      const rid=id();db.prepare("INSERT INTO payment_reversals(id,tenant_id,payment_id,amount_pkr,reason,created_by) VALUES(?,?,?,?,?,?)").run(rid,t,payment.id,amount,reason,req.user.id);
      syncInvoiceStatus(db,t,payment.invoice_id);audit(req.user,"create","payment_reversal",rid);
      return db.prepare("SELECT * FROM payment_reversals WHERE id=?").get(rid);
    });res.status(201).json({success:true,data:result});}
    catch(e){if(e.message==="PAYMENT_NOT_FOUND")return fail(res,404,"Payment not found.");if(e.message==="REVERSAL_EXCEEDS_REMAINING")return fail(res,400,"Reversal exceeds the unreversed payment amount.");throw e;}
  });
  app.post("/api/v1/invoices/:id/credit-notes",auth,(req,res)=>{
    const b=req.body||{},amount=Number(b.amountPkr),reason=String(b.reason||"").trim(),t=req.user.tenant_id;
    if(!validAmount(amount)||reason.length<3)return fail(res,400,"Positive amount and a reason (at least 3 characters) are required.");
    try{const note=withTransaction(db,()=>{
      const inv=db.prepare("SELECT id FROM invoices WHERE id=? AND tenant_id=?").get(req.params.id,t);if(!inv)throw new Error("INVOICE_NOT_FOUND");
      const n=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) total FROM credit_notes WHERE invoice_id=? AND tenant_id=?").get(inv.id,t).total;
      const total=db.prepare("SELECT amount_pkr FROM invoices WHERE id=?").get(inv.id).amount_pkr;
      if(amount>total-n)throw new Error("CREDIT_EXCEEDS_TOTAL");
      const cid=id();db.prepare("INSERT INTO credit_notes(id,tenant_id,invoice_id,amount_pkr,reason,created_by) VALUES(?,?,?,?,?,?)").run(cid,t,inv.id,amount,reason,req.user.id);
      syncInvoiceStatus(db,t,inv.id);audit(req.user,"create","credit_note",cid);
      return db.prepare("SELECT * FROM credit_notes WHERE id=?").get(cid);
    });res.status(201).json({success:true,data:note});}
    catch(e){if(e.message==="INVOICE_NOT_FOUND")return fail(res,404,"Invoice not found.");if(e.message==="CREDIT_EXCEEDS_TOTAL")return fail(res,400,"Credit notes cannot exceed the original invoice total.");throw e;}
  });
  app.get("/api/v1/reconciliation/unallocated",auth,(req,res)=>res.json({success:true,data:db.prepare("SELECT * FROM unallocated_payments WHERE tenant_id=? AND status='unallocated' ORDER BY received_at DESC").all(req.user.tenant_id)}));
  app.post("/api/v1/reconciliation/unallocated",auth,(req,res)=>{
    const b=req.body||{},amount=Number(b.amountPkr),methods=["cash","bank","jazzcash","easypaisa","other"],t=req.user.tenant_id;
    if(!b.customerId||!validAmount(amount)||!methods.includes(b.method))return fail(res,400,"Customer, positive amount and valid payment method are required.");
    if(!db.prepare("SELECT id FROM customers WHERE id=? AND tenant_id=?").get(b.customerId,t))return fail(res,404,"Customer not found.");
    const uid=id();const row=withTransaction(db,()=>{db.prepare("INSERT INTO unallocated_payments(id,tenant_id,customer_id,amount_pkr,method,reference,created_by) VALUES(?,?,?,?,?,?,?)").run(uid,t,b.customerId,amount,b.method,b.reference||null,req.user.id);audit(req.user,"create","unallocated_payment",uid);return db.prepare("SELECT * FROM unallocated_payments WHERE id=?").get(uid);});res.status(201).json({success:true,data:row});
  });
  app.post("/api/v1/reconciliation/unallocated/:id/allocate",auth,(req,res)=>{
    const t=req.user.tenant_id;
    try{const out=withTransaction(db,()=>{
      const u=db.prepare("SELECT * FROM unallocated_payments WHERE id=? AND tenant_id=? AND status='unallocated'").get(req.params.id,t);
      if(!u)throw new Error("UNALLOCATED_NOT_FOUND");
      const inv=db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=? AND customer_id=?").get(req.body?.invoiceId,t,u.customer_id);
      if(!inv)throw new Error("INVOICE_NOT_FOUND");
      const bal=invoiceBalance(db,t,inv.id);if(u.amount_pkr>bal.balance)throw new Error("AMOUNT_EXCEEDS_BALANCE");
      const pid=id();db.prepare("INSERT INTO payments(id,tenant_id,invoice_id,amount_pkr,method,reference,received_at) VALUES(?,?,?,?,?,?,?)").run(pid,t,inv.id,u.amount_pkr,u.method,u.reference,u.received_at);
      db.prepare("UPDATE unallocated_payments SET status='allocated',allocated_invoice_id=? WHERE id=? AND tenant_id=?").run(inv.id,u.id,t);
      syncInvoiceStatus(db,t,inv.id);audit(req.user,"allocate","unallocated_payment",u.id);
      return {unallocatedPaymentId:u.id,paymentId:pid,invoiceId:inv.id};
    });res.status(201).json({success:true,data:out});}
    catch(e){if(e.message==="UNALLOCATED_NOT_FOUND")return fail(res,404,"Unallocated payment not found.");if(e.message==="INVOICE_NOT_FOUND")return fail(res,404,"Invoice not found for this customer.");if(e.message==="AMOUNT_EXCEEDS_BALANCE")return fail(res,400,"Unallocated amount exceeds invoice balance.");throw e;}
  });
  app.get("/api/v1/reports/aging",auth,(req,res)=>{
    const rows=db.prepare(`SELECT i.id,i.invoice_number,i.customer_id,c.full_name customer_name,i.amount_pkr,i.due_date,
      i.amount_pkr-COALESCE((SELECT SUM(p.amount_pkr) FROM payments p WHERE p.invoice_id=i.id AND p.tenant_id=i.tenant_id),0)
      +COALESCE((SELECT SUM(r.amount_pkr) FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=i.id AND r.tenant_id=i.tenant_id),0)
      -COALESCE((SELECT SUM(n.amount_pkr) FROM credit_notes n WHERE n.invoice_id=i.id AND n.tenant_id=i.tenant_id),0) balance_pkr
      FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.tenant_id=? AND i.due_date IS NOT NULL AND i.due_date<date('now') ORDER BY i.due_date`).all(req.user.tenant_id);
    const buckets={"1_30":0,"31_60":0,"61_90":0,"90_plus":0};
    const data=rows.filter(x=>x.balance_pkr>0).map(x=>{const days=Math.max(1,Math.floor((Date.now()-Date.parse(x.due_date+"T00:00:00Z"))/86400000));const key=days<=30?"1_30":days<=60?"31_60":days<=90?"61_90":"90_plus";buckets[key]+=x.balance_pkr;return {...x,days_overdue:days,aging_bucket:key};});
    res.json({success:true,data:{bucketsPkr:buckets,totalOverduePkr:Object.values(buckets).reduce((a,b)=>a+b,0),invoices:data}});
  });
  app.get("/api/v1/reports/financial",auth,(req,res)=>{
    const from=req.query.from,to=req.query.to,t=req.user.tenant_id;
    if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))||(from&&to&&from>to))return fail(res,400,"Date range must use YYYY-MM-DD and start cannot follow end.");
    const dateFilter=(col)=>` AND date(${col})>=COALESCE(date(?),date('0001-01-01')) AND date(${col})<=COALESCE(date(?),date('9999-12-31'))`;
    const billed=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM invoices WHERE tenant_id=?"+dateFilter("created_at")).get(t,from||null,to||null).n;
    const collected=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM payments WHERE tenant_id=?"+dateFilter("received_at")).get(t,from||null,to||null).n;
    const refunded=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM payment_reversals WHERE tenant_id=?"+dateFilter("created_at")).get(t,from||null,to||null).n;
    const credits=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM credit_notes WHERE tenant_id=?"+dateFilter("created_at")).get(t,from||null,to||null).n;
    const outstanding=db.prepare(`SELECT COALESCE(SUM(MAX(0,i.amount_pkr-COALESCE((SELECT SUM(p.amount_pkr) FROM payments p WHERE p.invoice_id=i.id),0)+COALESCE((SELECT SUM(r.amount_pkr) FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=i.id),0)-COALESCE((SELECT SUM(n.amount_pkr) FROM credit_notes n WHERE n.invoice_id=i.id),0))),0) n FROM invoices i WHERE i.tenant_id=?`).get(t).n;
    const unallocated=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM unallocated_payments WHERE tenant_id=? AND status='unallocated'").get(t).n;
    res.json({success:true,data:{from:from||null,to:to||null,billedPkr:billed,collectedPkr:collected,refundedPkr:refunded,creditNotesPkr:credits,outstandingPkr:outstanding,unallocatedPkr:unallocated,netCollectedPkr:collected-refunded}});
  });
  app.get("/api/v1/invoices/:id/print",auth,(req,res)=>{
    const i=db.prepare("SELECT i.*,c.full_name,c.customer_code,c.phone,c.address FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id=? AND i.tenant_id=?").get(req.params.id,req.user.tenant_id);
    if(!i)return fail(res,404,"Invoice not found.");
    const b=invoiceBalance(db,req.user.tenant_id,i.id);
    res.type("html").send(html("Invoice "+i.invoice_number,`<h2>${esc(i.full_name)}</h2><p>${esc(i.customer_code)} · ${esc(i.phone)} · ${esc(i.address)}</p><p>Invoice: ${esc(i.invoice_number)} | Due: ${esc(i.due_date)}</p><table><tr><th>Description</th><th>PKR</th></tr><tr><td>Invoice total</td><td>${i.amount_pkr}</td></tr><tr><td>Payments received</td><td>${b.paid}</td></tr><tr><td>Refunds / reversals</td><td>${b.reversed}</td></tr><tr><td>Credit notes</td><td>${b.credited}</td></tr><tr><th>Balance due</th><th>${b.balance}</th></tr></table>`));
  });
  app.get("/api/v1/payments/:id/receipt",auth,(req,res)=>{
    const p=db.prepare("SELECT p.*,i.invoice_number,c.full_name,c.customer_code FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=i.customer_id WHERE p.id=? AND p.tenant_id=?").get(req.params.id,req.user.tenant_id);
    if(!p)return fail(res,404,"Payment not found.");
    res.type("html").send(html("Payment receipt",`<h2>${esc(p.full_name)}</h2><p>Customer: ${esc(p.customer_code)}</p><p>Receipt: ${esc(p.id)}</p><p>Invoice: ${esc(p.invoice_number)}</p><p>Date: ${esc(p.received_at)}</p><p>Method: ${esc(p.method)}</p><p>Reference: ${esc(p.reference)}</p><h2>Received PKR ${p.amount_pkr}</h2>`));
  });
}
