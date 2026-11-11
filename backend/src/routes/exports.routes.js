const EXPORTS = {
  customers: {
    permission: "customers.read",
    sql: "SELECT customer_code,full_name,phone,email,address,status,created_at FROM customers WHERE tenant_id=? ORDER BY created_at DESC",
    headers: ["Customer Code","Full Name","Phone","Email","Address","Status","Created At"]
  },
  packages: {
    permission: "packages.read",
    sql: "SELECT name,speed_down_mbps,speed_up_mbps,monthly_price_pkr,status,created_at FROM packages WHERE tenant_id=? ORDER BY created_at DESC",
    headers: ["Package","Download Mbps","Upload Mbps","Monthly Price PKR","Status","Created At"]
  },
  subscriptions: {
    permission: "subscriptions.read",
    sql: "SELECT c.customer_code,c.full_name,p.name package_name,p.speed_down_mbps,p.speed_up_mbps,p.monthly_price_pkr,s.status,s.started_at,s.created_at FROM subscriptions s JOIN customers c ON c.id=s.customer_id AND c.tenant_id=s.tenant_id JOIN packages p ON p.id=s.package_id WHERE s.tenant_id=? ORDER BY s.created_at DESC",
    headers: ["Customer Code","Customer","Package","Download Mbps","Upload Mbps","Monthly Price PKR","Status","Started At","Created At"]
  },
  invoices: {
    permission: "billing.read",
    sql: "SELECT c.customer_code,c.full_name,i.invoice_number,i.amount_pkr,i.due_date,i.status,i.created_at FROM invoices i JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id WHERE i.tenant_id=? ORDER BY i.created_at DESC",
    headers: ["Customer Code","Customer","Invoice Number","Amount PKR","Due Date","Status","Created At"]
  },
  payments: {
    permission: "billing.read",
    sql: "SELECT c.customer_code,c.full_name,i.invoice_number,p.amount_pkr,p.method,p.reference,p.received_at FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id WHERE p.tenant_id=? ORDER BY p.received_at DESC",
    headers: ["Customer Code","Customer","Invoice Number","Amount PKR","Method","Reference","Received At"]
  },
  tickets: {
    permission: "tickets.read",
    sql: "SELECT c.customer_code,c.full_name,t.subject,t.description,t.priority,t.status,t.created_at FROM support_tickets t JOIN customers c ON c.id=t.customer_id AND c.tenant_id=t.tenant_id WHERE t.tenant_id=? ORDER BY t.created_at DESC",
    headers: ["Customer Code","Customer","Subject","Description","Priority","Status","Created At"]
  },
  routers: {
    permission: "routers.read",
    sql: "SELECT name,host,api_port,location,status,notes,created_at,updated_at FROM routers WHERE tenant_id=? ORDER BY created_at DESC",
    headers: ["Name","Host","API Port","Location","Status","Notes","Created At","Updated At"]
  }
};

const csvCell = value => {
  let text = value == null ? "" : String(value);
  if (/^[\\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};

export function registerExportRoutes(app,{db,auth,fail}) {
  app.get("/api/v1/exports/:resource.csv",auth,(req,res)=>{
    const resource=EXPORTS[req.params.resource];
    if(!resource)return fail(res,404,"Export type not found.");
    const {hasPermission}=globalThis.__nexusPermissionHelpers || {};
    if(typeof hasPermission==="function"&&!hasPermission(db,req.user,resource.permission))
      return fail(res,403,"Your staff role does not have permission for this export.");
    const rows=db.prepare(resource.sql).all(req.user.tenant_id);
    const csv=[resource.headers,...rows.map(row=>Object.values(row))].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.setHeader("Content-Disposition",`attachment; filename="nexus-${req.params.resource}-${new Date().toISOString().slice(0,10)}.csv"`);
    res.setHeader("Cache-Control","no-store");
    res.send("\uFEFF"+csv);
  });
}
