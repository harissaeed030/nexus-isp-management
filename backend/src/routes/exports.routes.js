const MAX_EXPORT_ROWS = 50000;

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  // Prevent spreadsheet formula execution when a CSV is opened in Excel/Sheets.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function csvResponse(res, filename, columns, rows) {
  if (rows.length > MAX_EXPORT_ROWS) {
    return res.status(413).json({ success: false, error: "Export exceeds 50,000 rows. Narrow the date range or filters and try again." });
  }
  const body = [
    columns.map(([, label]) => csvCell(label)).join(","),
    ...rows.map(row => columns.map(([key]) => csvCell(row[key])).join(","))
  ].join("\r\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="' + filename + '"');
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  return res.status(200).send("\uFEFF" + body + "\r\n");
}

function dateRange(req, fail) {
  const from = req.query.from || null;
  const to = req.query.to || null;
  const valid = value => value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value);
  if (!valid(from) || !valid(to) || (from && to && from > to)) {
    fail.status = 400;
    fail.message = "Use valid YYYY-MM-DD from/to dates; from must not be after to.";
    return null;
  }
  return { from, to };
}

export function registerExportRoutes(app, { db, auth, fail }) {
  app.get("/api/v1/exports/:type.csv", auth, (req, res) => {
    const range = dateRange(req, {});
    if (!range) return fail(res, 400, "Use valid YYYY-MM-DD from/to dates; from must not be after to.");
    const tenant = req.user.tenant_id;
    const dateFilter = (column, params) => {
      const clauses = [];
      if (range.from) { clauses.push(column + " >= ?"); params.push(range.from); }
      if (range.to) { clauses.push(column + " < date(?, '+1 day')"); params.push(range.to); }
      return clauses.length ? " AND " + clauses.join(" AND ") : "";
    };

    if (req.params.type === "customers") {
      const params = [tenant], filter = dateFilter("c.created_at", params);
      const rows = db.prepare("SELECT c.account_number,c.full_name,c.phone,c.email,c.coverage_area,c.service_address,c.status,c.connection_status,c.created_at FROM customers c WHERE c.tenant_id=?" + filter + " ORDER BY c.created_at DESC LIMIT " + (MAX_EXPORT_ROWS + 1)).all(...params);
      return csvResponse(res, "nexus-customers.csv", [["account_number","Account Number"],["full_name","Customer"],["phone","Phone"],["email","Email"],["coverage_area","Coverage Area"],["service_address","Service Address"],["status","Account Status"],["connection_status","Connection Status"],["created_at","Created At"]], rows);
    }
    if (req.params.type === "invoices") {
      const params = [tenant], filter = dateFilter("i.created_at", params);
      const rows = db.prepare("SELECT i.invoice_number,c.account_number,c.full_name customer_name,i.amount_pkr,COALESCE((SELECT SUM(p.amount_pkr) FROM payments p WHERE p.tenant_id=i.tenant_id AND p.invoice_id=i.id),0)-COALESCE((SELECT SUM(r.amount_pkr) FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE r.tenant_id=i.tenant_id AND p.invoice_id=i.id),0) net_paid,COALESCE((SELECT SUM(n.amount_pkr) FROM credit_notes n WHERE n.tenant_id=i.tenant_id AND n.invoice_id=i.id),0) credit_notes,i.due_date,i.status,i.created_at FROM invoices i JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id WHERE i.tenant_id=?" + filter + " ORDER BY i.created_at DESC LIMIT " + (MAX_EXPORT_ROWS + 1)).all(...params);
      return csvResponse(res, "nexus-invoices.csv", [["invoice_number","Invoice Number"],["account_number","Account Number"],["customer_name","Customer"],["amount_pkr","Invoice PKR"],["net_paid","Net Paid PKR"],["credit_notes","Credit Notes PKR"],["due_date","Due Date"],["status","Status"],["created_at","Created At"]], rows);
    }
    if (req.params.type === "payments") {
      const params = [tenant], filter = dateFilter("p.received_at", params);
      const rows = db.prepare("SELECT p.id,p.received_at,i.invoice_number,c.account_number,c.full_name customer_name,p.amount_pkr,p.method,p.reference FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id WHERE p.tenant_id=?" + filter + " ORDER BY p.received_at DESC LIMIT " + (MAX_EXPORT_ROWS + 1)).all(...params);
      return csvResponse(res, "nexus-payments.csv", [["id","Payment ID"],["received_at","Received At"],["invoice_number","Invoice Number"],["account_number","Account Number"],["customer_name","Customer"],["amount_pkr","Amount PKR"],["method","Method"],["reference","Reference"]], rows);
    }
    if (req.params.type === "tickets") {
      const params = [tenant], filter = dateFilter("t.created_at", params);
      const rows = db.prepare("SELECT t.id,c.account_number,c.full_name customer_name,t.subject,t.description,t.priority,t.status,t.created_at FROM support_tickets t JOIN customers c ON c.id=t.customer_id AND c.tenant_id=t.tenant_id WHERE t.tenant_id=?" + filter + " ORDER BY t.created_at DESC LIMIT " + (MAX_EXPORT_ROWS + 1)).all(...params);
      return csvResponse(res, "nexus-support-tickets.csv", [["id","Ticket ID"],["account_number","Account Number"],["customer_name","Customer"],["subject","Subject"],["description","Description"],["priority","Priority"],["status","Status"],["created_at","Created At"]], rows);
    }
    return fail(res, 404, "Unknown export. Available exports: customers, invoices, payments, tickets.");
  });
}
