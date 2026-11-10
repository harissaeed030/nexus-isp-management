import { randomUUID } from "node:crypto";

export function registerOperationsRoutes(app,{db,auth,id,audit,fail,passwordHash,cleanUser}) {
  const roles=(...allowed)=>(req,res,next)=>allowed.includes(req.user.role)?next():fail(res,403,"Your staff role does not have permission for this action.");
  const ownerOrAdmin=roles("owner","admin");
  const networkRoles=roles("owner","admin","noc");
  const billingRoles=roles("owner","admin","billing");
  const staffRoles=roles("owner","admin");
  const validPeriod=v=>typeof v==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);

  // Staff accounts inherit tenant isolation from the authenticated owner workspace.
  app.get("/api/v1/staff",auth,staffRoles,(req,res)=>{
    const rows=db.prepare("SELECT id,email,full_name,role,status,created_at FROM users WHERE tenant_id=? ORDER BY created_at").all(req.user.tenant_id);
    res.json({success:true,data:rows});
  });
  app.post("/api/v1/staff",auth,ownerOrAdmin,(req,res)=>{
    const b=req.body||{};
    if(!b.fullName?.trim()||!b.email?.trim()||typeof b.password!=="string"||b.password.length<10||!["admin","billing","noc","support"].includes(b.role))
      return fail(res,400,"Name, valid email, password (10+ characters) and a staff role are required.");
    if(req.user.role!=="owner"&&b.role==="admin") return fail(res,403,"Only the owner can create an administrator.");
    const uid=id();
    try{
      db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,full_name,role) VALUES(?,?,?,?,?,?)")
        .run(uid,req.user.tenant_id,b.email.trim().toLowerCase(),passwordHash(b.password),b.fullName.trim(),b.role);
      audit(req.user,"create","staff",uid);
      res.status(201).json({success:true,data:cleanUser(db.prepare("SELECT * FROM users WHERE id=?").get(uid))});
    }catch(e){if(String(e.message).includes("UNIQUE"))return fail(res,409,"This email already has an account in your workspace.");throw e;}
  });
  app.patch("/api/v1/staff/:id",auth,ownerOrAdmin,(req,res)=>{
    const target=db.prepare("SELECT * FROM users WHERE id=? AND tenant_id=?").get(req.params.id,req.user.tenant_id);
    if(!target)return fail(res,404,"Staff account not found.");
    if(target.role==="owner")return fail(res,403,"The owner account cannot be changed here.");
    if(req.user.role!=="owner"&&target.role==="admin")return fail(res,403,"Only the owner can manage administrators.");
    const role=req.body?.role??target.role,status=req.body?.status??target.status;
    if(!["admin","billing","noc","support"].includes(role)||!["active","inactive"].includes(status))return fail(res,400,"Invalid role or status.");
    if(req.user.role!=="owner"&&role==="admin")return fail(res,403,"Only the owner can assign administrator role.");
    db.prepare("UPDATE users SET role=?,status=? WHERE id=? AND tenant_id=?").run(role,status,target.id,req.user.tenant_id);
    if(status==="inactive")db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
    audit(req.user,"update","staff",target.id);
    res.json({success:true,data:cleanUser(db.prepare("SELECT * FROM users WHERE id=?").get(target.id))});
  });

  // Router inventory only. No RouterOS credentials are stored and no device commands are sent.
  app.get("/api/v1/routers",auth,networkRoles,(req,res)=>{
    res.json({success:true,data:db.prepare("SELECT id,name,host,api_port,location,status,notes,created_at,updated_at FROM routers WHERE tenant_id=? ORDER BY created_at DESC").all(req.user.tenant_id)});
  });
  app.post("/api/v1/routers",auth,networkRoles,(req,res)=>{
    const b=req.body||{},port=Number(b.apiPort??8728);
    if(!b.name?.trim()||!b.host?.trim()||!Number.isInteger(port)||port<1||port>65535)return fail(res,400,"Router name, host/IP and valid API port are required.");
    const rid=id();
    try{
      db.prepare("INSERT INTO routers(id,tenant_id,name,host,api_port,location,notes) VALUES(?,?,?,?,?,?,?)")
        .run(rid,req.user.tenant_id,b.name.trim(),b.host.trim(),port,b.location?.trim()||null,b.notes?.trim()||null);
      audit(req.user,"create","router",rid);
      res.status(201).json({success:true,data:db.prepare("SELECT id,name,host,api_port,location,status,notes,created_at FROM routers WHERE id=?").get(rid)});
    }catch(e){if(String(e.message).includes("UNIQUE"))return fail(res,409,"This router host and API port are already registered.");throw e;}
  });
  app.patch("/api/v1/routers/:id",auth,networkRoles,(req,res)=>{
    const r=db.prepare("SELECT * FROM routers WHERE id=? AND tenant_id=?").get(req.params.id,req.user.tenant_id);
    if(!r)return fail(res,404,"Router not found.");
    const b=req.body||{},name=b.name??r.name,host=b.host??r.host,port=Number(b.apiPort??r.api_port),status=b.status??r.status;
    if(!name?.trim()||!host?.trim()||!Number.isInteger(port)||port<1||port>65535||!["configured","maintenance","disabled"].includes(status))return fail(res,400,"Invalid router details.");
    try{
      db.prepare("UPDATE routers SET name=?,host=?,api_port=?,location=?,notes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?")
        .run(name.trim(),host.trim(),port,b.location??r.location,b.notes??r.notes,status,r.id,req.user.tenant_id);
      audit(req.user,"update","router",r.id);
      res.json({success:true,data:db.prepare("SELECT id,name,host,api_port,location,status,notes,created_at,updated_at FROM routers WHERE id=?").get(r.id)});
    }catch(e){if(String(e.message).includes("UNIQUE"))return fail(res,409,"This router host and API port are already registered.");throw e;}
  });
  app.delete("/api/v1/routers/:id",auth,roles("owner","admin"),(req,res)=>{
    const result=db.prepare("DELETE FROM routers WHERE id=? AND tenant_id=?").run(req.params.id,req.user.tenant_id);
    if(!result.changes)return fail(res,404,"Router not found.");
    audit(req.user,"delete","router",req.params.id);
    res.json({success:true});
  });

  // Generate one invoice per active subscription for a selected month; unique run prevents duplicates.
  app.post("/api/v1/billing/generate",auth,billingRoles,(req,res)=>{
    const period=req.body?.period;
    if(!validPeriod(period))return fail(res,400,"Billing period must use YYYY-MM format.");
    const tenant=req.user.tenant_id;
    if(db.prepare("SELECT id FROM billing_runs WHERE tenant_id=? AND billing_period=?").get(tenant,period))
      return fail(res,409,"Invoices for this billing period have already been generated.");
    const [year,month]=period.split("-").map(Number);
    const dueDate=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    let created=0;
    try{
      db.exec("BEGIN IMMEDIATE");
      if(db.prepare("SELECT id FROM billing_runs WHERE tenant_id=? AND billing_period=?").get(tenant,period))throw new Error("BILLING_PERIOD_EXISTS");
      const subs=db.prepare("SELECT s.id,s.customer_id,p.monthly_price_pkr,c.status customer_status FROM subscriptions s JOIN packages p ON p.id=s.package_id JOIN customers c ON c.id=s.customer_id WHERE s.tenant_id=? AND s.status='active' AND p.status='active' AND c.status='active'").all(tenant);
      const insert=db.prepare("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,amount_pkr,due_date) VALUES(?,?,?,?,?,?)");
      for(const s of subs){
        const invoiceNo="NXS-"+period.replace("-","")+"-"+s.id.replace(/-/g,"").slice(0,10).toUpperCase();
        insert.run(id(),tenant,s.customer_id,invoiceNo,s.monthly_price_pkr,dueDate);created++;
      }
      db.prepare("INSERT INTO billing_runs(id,tenant_id,billing_period,invoices_created,created_by) VALUES(?,?,?,?,?)").run(id(),tenant,period,created,req.user.id);
      db.exec("COMMIT");
      audit(req.user,"generate","billing_run",period);
      res.status(201).json({success:true,period,invoicesCreated:created,dueDate});
    }catch(e){
      try{db.exec("ROLLBACK")}catch{}
      if(String(e.message).includes("BILLING_PERIOD_EXISTS"))return fail(res,409,"Invoices for this billing period have already been generated.");
      throw e;
    }
  });
  app.get("/api/v1/billing/runs",auth,billingRoles,(req,res)=>{
    res.json({success:true,data:db.prepare("SELECT billing_period,invoices_created,created_at FROM billing_runs WHERE tenant_id=? ORDER BY billing_period DESC LIMIT 24").all(req.user.tenant_id)});
  });

  app.get("/api/v1/reports/summary",auth,billingRoles,(req,res)=>{
    const tenant=req.user.tenant_id;
    const revenue=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) total FROM payments WHERE tenant_id=?").get(tenant).total;
    const outstanding=db.prepare("SELECT COALESCE(SUM(i.amount_pkr-COALESCE(p.paid,0)),0) total FROM invoices i LEFT JOIN (SELECT invoice_id,SUM(amount_pkr) paid FROM payments WHERE tenant_id=? GROUP BY invoice_id) p ON p.invoice_id=i.id WHERE i.tenant_id=? AND i.status IN ('unpaid','partial')").get(tenant,tenant).total;
    const monthly=db.prepare("SELECT substr(received_at,1,7) month,SUM(amount_pkr) revenue FROM payments WHERE tenant_id=? GROUP BY substr(received_at,1,7) ORDER BY month DESC LIMIT 12").all(tenant);
    const invoiceCounts=db.prepare("SELECT status,COUNT(*) count FROM invoices WHERE tenant_id=? GROUP BY status").all(tenant);
    res.json({success:true,data:{revenuePkr:revenue,outstandingPkr:outstanding,monthlyRevenue:monthly,invoiceCounts}});
  });
}
