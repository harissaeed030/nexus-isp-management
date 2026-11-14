export function nextInvoiceNumber(db,tenantId,period) {
  const row=db.prepare("SELECT last_number FROM invoice_sequences WHERE tenant_id=? AND billing_period=?").get(tenantId,period);
  let next=(row?.last_number||0)+1,number;
  do { number="INV-"+period.replace("-","")+"-"+String(next).padStart(6,"0"); if(db.prepare("SELECT 1 FROM invoices WHERE tenant_id=? AND invoice_number=?").get(tenantId,number))next++; else break; } while(next<1000000000);
  if(next>=1000000000)throw new Error("INVOICE_NUMBER_SPACE_EXHAUSTED");
  db.prepare("INSERT INTO invoice_sequences(tenant_id,billing_period,last_number) VALUES(?,?,?) ON CONFLICT(tenant_id,billing_period) DO UPDATE SET last_number=excluded.last_number").run(tenantId,period,next);
  return number;
}
export function invoiceBalance(db,tenantId,invoiceId) {
  const row=db.prepare(`SELECT i.amount_pkr,i.due_date,
    COALESCE((SELECT SUM(amount_pkr) FROM payments WHERE tenant_id=i.tenant_id AND invoice_id=i.id),0) paid,
    COALESCE((SELECT SUM(r.amount_pkr) FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE r.tenant_id=i.tenant_id AND p.invoice_id=i.id),0) reversed,
    COALESCE((SELECT SUM(amount_pkr) FROM credit_notes WHERE tenant_id=i.tenant_id AND invoice_id=i.id),0) credited
    FROM invoices i WHERE i.id=? AND i.tenant_id=?`).get(invoiceId,tenantId);
  if(!row)return null;
  return {...row,balance:row.amount_pkr-row.credited-row.paid+row.reversed,netPaid:row.paid-row.reversed};
}
export function syncInvoiceStatus(db,tenantId,invoiceId) {
  const b=invoiceBalance(db,tenantId,invoiceId); if(!b)return;
  const today=new Date().toISOString().slice(0,10);
  const status=b.credited>=b.amount_pkr?"credited":b.balance<=0?"paid":b.due_date&&b.due_date<today?"overdue":b.netPaid>0?"partial":"unpaid";
  db.prepare("UPDATE invoices SET status=? WHERE id=? AND tenant_id=?").run(status,invoiceId,tenantId);
}
