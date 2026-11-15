import { randomUUID } from "node:crypto";
import { PERMISSIONS, getEffectivePermissions, hasPermission, permissionKeys, roleHasPermission } from "../lib/permissions.js";

export function registerOperationsRoutes(app,{db,auth,id,audit,fail,passwordHash,cleanUser}) {
  const roles=(...allowed)=>(req,res,next)=>allowed.includes(req.user.role)?next():fail(res,403,"Your staff role does not have permission for this action.");
  const ownerOrAdmin=roles("owner","admin");
  const permit=permission=>(req,res,next)=>hasPermission(db,req.user,permission)?next():fail(res,403,"Your staff role does not have permission for this action.");
  const billingGenerate=permit("billing.generate");
  const billingRead=permit("billing.read");
  const reportsRead=permit("reports.read");
  const validPeriod=v=>typeof v==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);

  // Staff accounts inherit tenant isolation from the authenticated owner workspace.
  app.get("/api/v1/staff",auth,ownerOrAdmin,(req,res)=>{
    const rows=db.prepare("SELECT id,email,full_name,role,status,created_at FROM users WHERE tenant_id=? ORDER BY created_at").all(req.user.tenant_id);
    res.json({success:true,data:rows});
  });
  app.post("/api/v1/staff",auth,ownerOrAdmin,(req,res)=>{
    const b=req.body||{};
    if(!b.fullName?.trim()||!b.email?.trim()||typeof b.password!=="string"||b.password.length<10||!["admin","billing","noc","support","technician","staff"].includes(b.role))
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
    if(!["admin","billing","noc","support","technician","staff"].includes(role)||!["active","inactive"].includes(status))return fail(res,400,"Invalid role or status.");
    if(req.user.role!=="owner"&&role==="admin")return fail(res,403,"Only the owner can assign administrator role.");
    db.prepare("UPDATE users SET role=?,status=? WHERE id=? AND tenant_id=?").run(role,status,target.id,req.user.tenant_id);
    if(role!==target.role)db.prepare("DELETE FROM user_permissions WHERE tenant_id=? AND user_id=?").run(req.user.tenant_id,target.id);
    if(status==="inactive")db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
    audit(req.user,"update","staff",target.id);
    res.json({success:true,data:cleanUser(db.prepare("SELECT * FROM users WHERE id=?").get(target.id))});
  });

  app.get("/api/v1/staff/:id/permissions",auth,ownerOrAdmin,(req,res)=>{
    const target=db.prepare("SELECT * FROM users WHERE id=? AND tenant_id=?").get(req.params.id,req.user.tenant_id);
    if(!target)return fail(res,404,"Staff account not found.");
    if(target.role==="owner")return fail(res,403,"The owner account permissions cannot be changed here.");
    if(req.user.role!=="owner"&&target.role==="admin")return fail(res,403,"Only the owner can manage administrators.");
    res.json({success:true,data:{role:target.role,permissions:getEffectivePermissions(db,target)}});
  });
  app.put("/api/v1/staff/:id/permissions",auth,ownerOrAdmin,(req,res)=>{
    const target=db.prepare("SELECT * FROM users WHERE id=? AND tenant_id=?").get(req.params.id,req.user.tenant_id);
    if(!target)return fail(res,404,"Staff account not found.");
    if(target.role==="owner")return fail(res,403,"The owner account permissions cannot be changed here.");
    if(req.user.role!=="owner"&&target.role==="admin")return fail(res,403,"Only the owner can manage administrators.");
    const allowed=req.body?.allowedPermissions;
    if(!Array.isArray(allowed)||allowed.some(key=>typeof key!=="string"||!permissionKeys.has(key)))
      return fail(res,400,"A valid allowedPermissions list is required.");
    const selected=new Set(allowed);
    try{
      db.exec("BEGIN IMMEDIATE");
      db.prepare("DELETE FROM user_permissions WHERE tenant_id=? AND user_id=?").run(req.user.tenant_id,target.id);
      const insert=db.prepare("INSERT INTO user_permissions(id,tenant_id,user_id,permission,allowed,updated_by) VALUES(?,?,?,?,?,?)");
      for(const item of PERMISSIONS){
        const value=selected.has(item.key)?1:0;
        if(Boolean(value)!==roleHasPermission(target.role,item.key))
          insert.run(id(),req.user.tenant_id,target.id,item.key,value,req.user.id);
      }
      db.exec("COMMIT");
    }catch(error){
      try{db.exec("ROLLBACK")}catch{}
      throw error;
    }
    audit(req.user,"update","staff_permissions",target.id);
    res.json({success:true,data:{role:target.role,permissions:getEffectivePermissions(db,target)}});
  });

  // Router inventory CRUD is registered by registerMikroTikRoutes, which also
  // stores encrypted credentials and runs live RouterOS commands. That earlier
  // registration is the single source of truth for /api/v1/routers, so this
  // inventory-only block is intentionally omitted here to avoid a duplicate
  // route shadowing the live integration path.

  // Tenant profile for the authenticated workspace.
  app.get("/api/v1/tenant",auth,ownerOrAdmin,(req,res)=>{
    const t=db.prepare("SELECT id,name,slug,email,phone,address,timezone,status,created_at FROM tenants WHERE id=?").get(req.user.tenant_id);
    if(!t)return fail(res,404,"Tenant not found.");
    res.json({success:true,data:t});
  });
  app.patch("/api/v1/tenant",auth,ownerOrAdmin,(req,res)=>{
    const t=db.prepare("SELECT * FROM tenants WHERE id=?").get(req.user.tenant_id);
    if(!t)return fail(res,404,"Tenant not found.");
    const b=req.body||{};
    const name=b.name===undefined?t.name:String(b.name).trim();
    const email=b.email===undefined?t.email:String(b.email||"").trim()||null;
    const phone=b.phone===undefined?t.phone:String(b.phone||"").trim()||null;
    const address=b.address===undefined?t.address:String(b.address||"").trim()||null;
    const timezone=b.timezone===undefined?t.timezone:String(b.timezone||"").trim()||"UTC";
    if(!name||name.length>160)return fail(res,400,"Valid company name is required.");
    if(email&&email.length>200)return fail(res,400,"Email is too long.");
    if(phone&&phone.length>40)return fail(res,400,"Phone is too long.");
    if(address&&address.length>400)return fail(res,400,"Address is too long.");
    db.prepare("UPDATE tenants SET name=?,email=?,phone=?,address=?,timezone=? WHERE id=?").run(name,email,phone,address,timezone,req.user.tenant_id);
    audit(req.user,"update","tenant",req.user.tenant_id);
    res.json({success:true,data:db.prepare("SELECT id,name,slug,email,phone,address,timezone,status,created_at FROM tenants WHERE id=?").get(req.user.tenant_id)});
  });

  // Generate one invoice per active subscription for a selected month; unique run prevents duplicates.
  app.post("/api/v1/billing/generate",auth,billingGenerate,(req,res)=>{
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
      const nextNumber=db.prepare("INSERT INTO invoice_sequences(tenant_id,billing_period,last_number) VALUES(?,?,1) ON CONFLICT(tenant_id,billing_period) DO UPDATE SET last_number=last_number+1 RETURNING last_number");
      for(const s of subs){
        const sequence=nextNumber.get(tenant,period);
        const invoiceNo="INV-"+period.replace("-","")+"-"+String(sequence.last_number).padStart(6,"0");
        insert.run(id(),tenant,s.customer_id,invoiceNo,s.monthly_price_pkr,dueDate);created++;
      }
      db.prepare("INSERT INTO billing_runs(id,tenant_id,billing_period,invoices_created,created_by) VALUES(?,?,?,?,?)").run(id(),tenant,period,created,req.user.id);
      audit(req.user,"generate","billing_run",period);
      db.exec("COMMIT");
      res.status(201).json({success:true,period,invoicesCreated:created,dueDate});
    }catch(e){
      try{db.exec("ROLLBACK")}catch{}
      if(String(e.message).includes("BILLING_PERIOD_EXISTS"))return fail(res,409,"Invoices for this billing period have already been generated.");
      throw e;
    }
  });
  app.get("/api/v1/billing/runs",auth,billingRead,(req,res)=>{
    res.json({success:true,data:db.prepare("SELECT billing_period,invoices_created,created_at FROM billing_runs WHERE tenant_id=? ORDER BY billing_period DESC LIMIT 24").all(req.user.tenant_id)});
  });

  app.get("/api/v1/reports/summary",auth,reportsRead,(req,res)=>{
    const tenant=req.user.tenant_id;
    const revenue=db.prepare("SELECT COALESCE((SELECT SUM(amount_pkr) FROM payments WHERE tenant_id=?),0)-COALESCE((SELECT SUM(amount_pkr) FROM payment_reversals WHERE tenant_id=?),0) total").get(tenant,tenant).total;
    const outstanding=db.prepare("SELECT COALESCE(SUM(CASE WHEN i.amount_pkr-COALESCE(p.paid,0)+COALESCE(r.reversed,0)-COALESCE(c.credits,0)>0 THEN i.amount_pkr-COALESCE(p.paid,0)+COALESCE(r.reversed,0)-COALESCE(c.credits,0) ELSE 0 END),0) total FROM invoices i LEFT JOIN (SELECT invoice_id,SUM(amount_pkr) paid FROM payments WHERE tenant_id=? GROUP BY invoice_id) p ON p.invoice_id=i.id LEFT JOIN (SELECT p.invoice_id,SUM(r.amount_pkr) reversed FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE r.tenant_id=? GROUP BY p.invoice_id) r ON r.invoice_id=i.id LEFT JOIN (SELECT invoice_id,SUM(amount_pkr) credits FROM credit_notes WHERE tenant_id=? GROUP BY invoice_id) c ON c.invoice_id=i.id WHERE i.tenant_id=?").get(tenant,tenant,tenant,tenant).total;
    const monthlyPaid=db.prepare("SELECT substr(received_at,1,7) month,SUM(amount_pkr) amount FROM payments WHERE tenant_id=? GROUP BY substr(received_at,1,7)").all(tenant);
    const monthlyReversed=db.prepare("SELECT substr(r.created_at,1,7) month,SUM(r.amount_pkr) amount FROM payment_reversals r WHERE r.tenant_id=? GROUP BY substr(r.created_at,1,7)").all(tenant);
    const monthlyMap=new Map();
    for(const row of monthlyPaid)monthlyMap.set(row.month,Number(row.amount));
    for(const row of monthlyReversed)monthlyMap.set(row.month,(monthlyMap.get(row.month)||0)-Number(row.amount));
    const monthly=[...monthlyMap].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12).map(([month,revenue])=>({month,revenue}));
    const invoiceCounts=db.prepare("SELECT status,COUNT(*) count FROM invoices WHERE tenant_id=? GROUP BY status").all(tenant);
    res.json({success:true,data:{revenuePkr:revenue,outstandingPkr:outstanding,monthlyRevenue:monthly,invoiceCounts}});
  });
}
