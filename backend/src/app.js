import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID,randomBytes,createHash,scryptSync,timingSafeEqual } from "node:crypto";
import { db } from "./config/database.js";
import { env } from "./config/env.js";
import { registerOperationsRoutes } from "./routes/operations.routes.js";
import { registerCustomerRoutes } from "./routes/customer-subscription.routes.js";
import { registerMikroTikRoutes } from "./routes/mikrotik.routes.js";
import { registerOltRoutes } from "./routes/olt.routes.js";
import { registerTr069Routes } from "./routes/tr069.routes.js";
import { registerPortalRoutes } from "./routes/portal-notification.routes.js";
import { registerFinancialRoutes } from "./routes/financial.routes.js";
import { registerBusinessRoutes } from "./routes/business.routes.js";
import { registerExportRoutes } from "./routes/exports.routes.js";
import { registerSyncExportRoutes } from "./routes/sync-export.routes.js";
import { registerAiRoutes } from "./routes/ai.routes.js";
import { hasPermission, permissionFor } from "./lib/permissions.js";
import { withTransaction } from "./lib/transactions.js";
const app=express();app.disable("x-powered-by");app.use(helmet());
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../../");
app.use("/assets",express.static(resolve(projectRoot,"assets"),{fallthrough:false,maxAge:"1h"}));
app.use(cors({origin(origin,cb){if(!origin||env.corsOrigins.includes(origin))return cb(null,true);cb(new Error("Origin is not allowed by CORS."));}}));
app.use(express.json({limit:"100kb",verify:(req,_res,buffer)=>{req.rawBody=Buffer.from(buffer);}}));app.use(rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:"draft-7",legacyHeaders:false}));
const id=()=>randomUUID(),hashToken=v=>createHash("sha256").update(v).digest("hex"),required=v=>typeof v==="string"&&v.trim().length>0;
const passwordHash=p=>{const salt=randomBytes(16).toString("hex");return salt+":"+scryptSync(p,salt,64).toString("hex");};
const verifyPassword=(p,s)=>{try{const [salt,key]=s.split(":");const a=scryptSync(p,salt,64),b=Buffer.from(key,"hex");return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}};
const cleanUser=u=>({id:u.id,tenantId:u.tenant_id,email:u.email,fullName:u.full_name,role:u.role});
const fail=(res,status,error)=>res.status(status).json({success:false,error});
function auth(req,res,next){
  const raw=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!raw)return fail(res,401,"Authentication required.");
  const u=db.prepare("SELECT u.*,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'").get(hashToken(raw),new Date().toISOString());
  if(!u)return fail(res,401,"Session expired or invalid.");
  const selfRoute=req.path==="/api/v1/auth/me"||req.path==="/api/v1/auth/logout"||req.path==="/api/v1/tenant";
  const staffAdminRoute=req.path==="/api/v1/staff"||req.path.startsWith("/api/v1/staff/");
  if(!selfRoute&&!staffAdminRoute){
    const permission=permissionFor(req.path,req.method);
    if(!permission||!hasPermission(db,u,permission))return fail(res,403,"Your staff role does not have permission for this action.");
  }
  req.user=u;next();
}
function audit(u,action,type,rid){db.prepare("INSERT INTO audit_logs(id,tenant_id,actor_user_id,action,resource_type,resource_id) VALUES(?,?,?,?,?,?)").run(id(),u.tenant_id,u.id,action,type,rid||null);}
app.get("/",(_q,r)=>r.sendFile(resolve(projectRoot,"index.html")));
app.get("/portal",(_q,r)=>r.sendFile(resolve(projectRoot,"portal/index.html")));
app.get("/notifications",(_q,r)=>r.sendFile(resolve(projectRoot,"notifications/index.html")));
app.get("/api/v1/health",(_q,r)=>r.json({success:true,status:"running",database:"connected",timestamp:new Date().toISOString()}));
app.post("/api/v1/setup",(req,res)=>{const b=req.body||{};if(!required(b.companyName)||!required(b.fullName)||!required(b.email)||!required(b.password)||b.password.length<10)return fail(res,400,"Company, name, email and password (minimum 10 characters) are required.");let created;try{created=withTransaction(db,()=>{if(db.prepare("SELECT COUNT(*) n FROM users").get().n>0)throw new Error("SETUP_ALREADY_COMPLETE");const tid=id(),uid=id(),slug=b.companyName.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-")+"-"+tid.slice(0,6);db.prepare("INSERT INTO tenants(id,name,slug,plan,customer_limit) VALUES(?,?,?,'pro',100000)").run(tid,b.companyName.trim(),slug);db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,full_name,role) VALUES(?,?,?,?,?,'owner')").run(uid,tid,b.email.trim().toLowerCase(),passwordHash(b.password),b.fullName.trim());const token=randomBytes(32).toString("base64url");db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hashToken(token),uid,new Date(Date.now()+604800000).toISOString());audit({id:uid,tenant_id:tid},"initial_setup","tenant",tid);return {tid,uid,token};});}catch(e){if(e.message==="SETUP_ALREADY_COMPLETE")return fail(res,409,"Initial setup is already complete. Sign in instead.");throw e;}const {tid,uid,token}=created;res.status(201).json({success:true,token,user:cleanUser(db.prepare("SELECT * FROM users WHERE id=?").get(uid)),tenant:{id:tid,name:b.companyName.trim()}});});
app.post("/api/v1/auth/login",rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:"draft-7",legacyHeaders:false,message:{success:false,error:"Too many login attempts. Try again in 15 minutes."}}),(req,res)=>{const b=req.body||{};if(!required(b.email)||!required(b.password))return fail(res,400,"Email and password are required.");const rows=db.prepare("SELECT u.*,t.name tenant_name,t.slug tenant_slug FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.email=? COLLATE NOCASE AND u.status='active' AND t.status='active' ORDER BY u.created_at").all(b.email.trim());let matches=rows.filter(u=>verifyPassword(b.password,u.password_hash));if(required(b.tenantSlug))matches=matches.filter(u=>u.tenant_slug===b.tenantSlug.trim());if(!matches.length)return fail(res,401,"Invalid email, password or workspace.");if(matches.length>1)return fail(res,409,"This login matches more than one workspace. Enter the workspace slug and try again.");const u=matches[0],token=randomBytes(32).toString("base64url");db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hashToken(token),u.id,new Date(Date.now()+604800000).toISOString());res.json({success:true,token,user:cleanUser(u),tenant:{id:u.tenant_id,name:u.tenant_name,slug:u.tenant_slug}});});
app.get("/api/v1/auth/me",auth,(req,res)=>res.json({success:true,user:cleanUser(req.user),tenant:db.prepare("SELECT id,name,brand_color,plan FROM tenants WHERE id=?").get(req.user.tenant_id)}));

app.post("/api/v1/tenants/register",rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:"draft-7",legacyHeaders:false,message:{success:false,error:"Too many workspace registrations. Try again later."}}),(req,res)=>{
  const b=req.body||{},company=typeof b.companyName==="string"?b.companyName.trim():"",fullName=typeof b.fullName==="string"?b.fullName.trim():"",email=typeof b.email==="string"?b.email.trim().toLowerCase():"",password=b.password;
  if(company.length<2||company.length>120||fullName.length<2||fullName.length>160||!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email)||email.length>254||typeof password!=="string"||password.length<10||password.length>256)
    return fail(res,400,"Company, owner name, valid email and password (10–256 characters) are required.");
  const base=(typeof b.slug==="string"&&b.slug.trim()?b.slug:company).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48);
  if(base.length<2)return fail(res,400,"Workspace name must contain at least two letters or numbers.");
  const tenantId=id(),userId=id(),slug=base+"-"+tenantId.slice(0,6),token=randomBytes(32).toString("base64url");
  try{
    withTransaction(db,()=>{
      db.prepare("INSERT INTO tenants(id,name,slug) VALUES(?,?,?)").run(tenantId,company,slug);
      db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,full_name,role) VALUES(?,?,?,?,?,'owner')").run(userId,tenantId,email,passwordHash(password),fullName);
      db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hashToken(token),userId,new Date(Date.now()+604800000).toISOString());
      audit({id:userId,tenant_id:tenantId},"tenant_registered","tenant",tenantId);
    });
  }catch(error){
    if(String(error.message).includes("UNIQUE"))return fail(res,409,"Workspace registration conflicted with an existing record. Please try again.");
    throw error;
  }
  return res.status(201).json({success:true,token,user:cleanUser(db.prepare("SELECT * FROM users WHERE id=?").get(userId)),tenant:{id:tenantId,name:company,slug}});
});
app.get("/api/v1/tenant",auth,(req,res)=>{
  if(req.user.role!=="owner")return fail(res,403,"Only the workspace owner can view workspace settings.");
  const tenant=db.prepare("SELECT id,name,slug,status,plan,customer_limit,brand_color,support_phone,address,created_at FROM tenants WHERE id=?").get(req.user.tenant_id);
  return tenant?res.json({success:true,data:tenant}):fail(res,404,"Workspace not found.");
});
app.patch("/api/v1/tenant",auth,(req,res)=>{
  if(req.user.role!=="owner")return fail(res,403,"Only the workspace owner can update workspace settings.");
  const b=req.body||{},cur=db.prepare("SELECT * FROM tenants WHERE id=?").get(req.user.tenant_id);
  const name=b.name===undefined?cur.name:(typeof b.name==="string"?b.name.trim():"");
  if(name.length<2||name.length>120)return fail(res,400,"Workspace name must be 2–120 characters.");
  const color=b.brandColor===undefined?cur.brand_color:b.brandColor;
  if(typeof color!=="string"||!/^#[0-9a-fA-F]{6}$/.test(color))return fail(res,400,"Brand colour must look like #16a34a.");
  const phone=b.supportPhone===undefined?cur.support_phone:(b.supportPhone===null?null:String(b.supportPhone).trim());
  if(phone!==null&&phone!==undefined&&(phone.length>30||!/^[0-9+()\-\s]*$/.test(phone)))return fail(res,400,"Support phone is not valid.");
  const addr=b.address===undefined?cur.address:(b.address===null?null:String(b.address).trim());
  if(addr&&addr.length>300)return fail(res,400,"Address is too long.");
  db.prepare("UPDATE tenants SET name=?,brand_color=?,support_phone=?,address=? WHERE id=?").run(name,color,phone||null,addr||null,req.user.tenant_id);
  audit(req.user,"update","tenant",req.user.tenant_id);
  return res.json({success:true,data:db.prepare("SELECT id,name,slug,status,plan,customer_limit,brand_color,support_phone,address,created_at FROM tenants WHERE id=?").get(req.user.tenant_id)});
});
app.post("/api/v1/auth/logout",auth,(req,res)=>{db.prepare("DELETE FROM sessions WHERE token_hash=?").run(req.user.token_hash);res.json({success:true});});
app.get("/api/v1/dashboard",auth,(req,res)=>{const t=req.user.tenant_id,c=sql=>db.prepare(sql).get(t).n;res.json({success:true,stats:{customers:c("SELECT COUNT(*) n FROM customers WHERE tenant_id=?"),activeCustomers:c("SELECT COUNT(*) n FROM customers WHERE tenant_id=? AND status='active'"),packages:c("SELECT COUNT(*) n FROM packages WHERE tenant_id=? AND status='active'"),unpaidInvoices:c("SELECT COUNT(*) n FROM invoices WHERE tenant_id=? AND status IN ('unpaid','partial')"),openTickets:c("SELECT COUNT(*) n FROM support_tickets WHERE tenant_id=? AND status IN ('open','in_progress')"),revenuePkr:db.prepare("SELECT COALESCE((SELECT SUM(amount_pkr) FROM payments WHERE tenant_id=?),0)-COALESCE((SELECT SUM(amount_pkr) FROM payment_reversals WHERE tenant_id=?),0) n").get(t,t).n,
suspendedCustomers:c("SELECT COUNT(*) n FROM customers WHERE tenant_id=? AND status='suspended'"),
expiringSubscriptions:c("SELECT COUNT(*) n FROM subscriptions WHERE tenant_id=? AND status='active' AND expires_at IS NOT NULL AND date(expires_at) BETWEEN date('now') AND date('now','+7 days')"),
dailyCollectionPkr:collected(t,"date(received_at)=date('now')","date(created_at)=date('now')"),
monthlyCollectionPkr:collected(t,"strftime('%Y-%m',received_at)=strftime('%Y-%m','now')","strftime('%Y-%m',created_at)=strftime('%Y-%m','now')"),
outstandingPkr:db.prepare("SELECT COALESCE(SUM(i.amount_pkr-COALESCE((SELECT SUM(p.amount_pkr) FROM payments p WHERE p.invoice_id=i.id AND p.tenant_id=i.tenant_id),0)+COALESCE((SELECT SUM(r.amount_pkr) FROM payment_reversals r JOIN payments p2 ON p2.id=r.payment_id WHERE p2.invoice_id=i.id AND r.tenant_id=i.tenant_id),0)),0) n FROM invoices i WHERE i.tenant_id=? AND i.status IN ('unpaid','partial')").get(t).n}});});
function collected(t,payWhere,revWhere){return db.prepare("SELECT COALESCE((SELECT SUM(amount_pkr) FROM payments WHERE tenant_id=? AND "+payWhere+"),0)-COALESCE((SELECT SUM(amount_pkr) FROM payment_reversals WHERE tenant_id=? AND "+revWhere+"),0) n").get(t,t).n}
registerCustomerRoutes(app,{db,auth,id,audit,fail});
registerMikroTikRoutes(app,{db,auth,id,audit,fail});
registerOltRoutes(app,{db,auth,id,audit,fail});
registerTr069Routes(app,{db,auth,id,audit,fail});
registerPortalRoutes(app,{db,auth,id,audit,fail,env});
registerFinancialRoutes(app,{db,auth,id,audit,fail});
registerBusinessRoutes(app,{db,auth,id,audit,fail});
registerExportRoutes(app,{db,auth,fail});
registerSyncExportRoutes(app,{db,env});
registerAiRoutes(app,{auth,env,fail});
app.get("/api/v1/packages",auth,(q,r)=>r.json({success:true,data:db.prepare("SELECT * FROM packages WHERE tenant_id=? ORDER BY created_at DESC").all(q.user.tenant_id)}));
app.post("/api/v1/packages",auth,(q,r)=>{const b=q.body||{},d=Number(b.speedDownMbps),u=Number(b.speedUpMbps),p=Number(b.monthlyPricePkr);if(!required(b.name)||!Number.isInteger(d)||d<1||!Number.isInteger(u)||u<1||!Number.isInteger(p)||p<0)return fail(r,400,"Valid package name, speeds and price are required.");const pid=id();db.prepare("INSERT INTO packages(id,tenant_id,name,speed_down_mbps,speed_up_mbps,monthly_price_pkr) VALUES(?,?,?,?,?,?)").run(pid,q.user.tenant_id,b.name.trim(),d,u,p);audit(q.user,"create","package",pid);r.status(201).json({success:true,data:db.prepare("SELECT * FROM packages WHERE id=?").get(pid)});});
app.patch("/api/v1/packages/:id",auth,(q,r)=>{const x=db.prepare("SELECT * FROM packages WHERE id=? AND tenant_id=?").get(q.params.id,q.user.tenant_id);if(!x)return fail(r,404,"Package not found.");const b=q.body||{},v={name:b.name??x.name,d:Number(b.speedDownMbps??x.speed_down_mbps),u:Number(b.speedUpMbps??x.speed_up_mbps),p:Number(b.monthlyPricePkr??x.monthly_price_pkr),s:b.status??x.status};if(!required(v.name)||!Number.isInteger(v.d)||v.d<1||!Number.isInteger(v.u)||v.u<1||!Number.isInteger(v.p)||v.p<0||!["active","archived"].includes(v.s))return fail(r,400,"Invalid package details.");db.prepare("UPDATE packages SET name=?,speed_down_mbps=?,speed_up_mbps=?,monthly_price_pkr=?,status=? WHERE id=? AND tenant_id=?").run(v.name,v.d,v.u,v.p,v.s,x.id,q.user.tenant_id);audit(q.user,"update","package",x.id);r.json({success:true,data:db.prepare("SELECT * FROM packages WHERE id=?").get(x.id)});});
app.get("/api/v1/invoices",auth,(q,r)=>r.json({success:true,data:db.prepare("SELECT i.*,c.full_name customer_name FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.tenant_id=? ORDER BY i.created_at DESC").all(q.user.tenant_id)}));
app.post("/api/v1/invoices",auth,(q,r)=>{
  const b=q.body||{},a=Number(b.amountPkr),dueDate=b.dueDate??null;
  if(!required(b.customerId)||!Number.isInteger(a)||a<0)return fail(r,400,"Customer and valid amount required.");
  if(dueDate!==null&&(typeof dueDate!=="string"||!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dueDate)||Number.isNaN(Date.parse(dueDate))||new Date(dueDate+"T00:00:00Z").toISOString().slice(0,10)!==dueDate))return fail(r,400,"Due date must be a real calendar date in YYYY-MM-DD format.");
  if(!db.prepare("SELECT id FROM customers WHERE id=? AND tenant_id=?").get(b.customerId,q.user.tenant_id))return fail(r,404,"Customer not found.");
  const iid=id(),period=required(b.billingPeriod)?b.billingPeriod:new Date().toISOString().slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))return fail(r,400,"Billing period must use YYYY-MM format.");
  try{
    const invoice=withTransaction(db,()=>{
      let no;
      if(required(b.invoiceNumber))no=b.invoiceNumber.trim();
      else{
        const sequence=db.prepare("INSERT INTO invoice_sequences(tenant_id,billing_period,last_number) VALUES(?,?,1) ON CONFLICT(tenant_id,billing_period) DO UPDATE SET last_number=last_number+1 RETURNING last_number").get(q.user.tenant_id,period);
        no="INV-"+period.replace("-","")+"-"+String(sequence.last_number).padStart(6,"0");
      }
      db.prepare("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,amount_pkr,due_date) VALUES(?,?,?,?,?,?)").run(iid,q.user.tenant_id,b.customerId,no,a,dueDate);
      audit(q.user,"create","invoice",iid);
      return db.prepare("SELECT * FROM invoices WHERE id=?").get(iid);
    });
    r.status(201).json({success:true,data:invoice});
  }catch(e){
    if(String(e.message).includes("UNIQUE"))return fail(r,409,"Invoice number already exists.");
    throw e;
  }
});
app.get("/api/v1/payments",auth,(q,r)=>r.json({success:true,data:db.prepare("SELECT p.*,i.invoice_number,c.full_name customer_name FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=i.customer_id WHERE p.tenant_id=? ORDER BY p.received_at DESC").all(q.user.tenant_id)}));
app.post("/api/v1/payments",auth,(q,r)=>{const b=q.body||{},a=Number(b.amountPkr),methods=["cash","bank","jazzcash","easypaisa","other"],inv=db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=?").get(b.invoiceId,q.user.tenant_id);if(!inv)return fail(r,404,"Invoice not found.");if(!Number.isInteger(a)||a<1||!methods.includes(b.method))return fail(r,400,"Valid payment amount and method required.");let payment;try{payment=withTransaction(db,()=>{const current=db.prepare("SELECT * FROM invoices WHERE id=? AND tenant_id=?").get(b.invoiceId,q.user.tenant_id);if(!current)throw new Error("INVOICE_NOT_FOUND");const paid=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM payments WHERE invoice_id=? AND tenant_id=?").get(current.id,q.user.tenant_id).n;const reversed=db.prepare("SELECT COALESCE(SUM(r.amount_pkr),0) n FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE r.tenant_id=? AND p.invoice_id=?").get(q.user.tenant_id,current.id).n;const credits=db.prepare("SELECT COALESCE(SUM(amount_pkr),0) n FROM credit_notes WHERE tenant_id=? AND invoice_id=?").get(q.user.tenant_id,current.id).n;const netPaid=paid-reversed,adjustedTotal=current.amount_pkr-credits;if(netPaid+a>adjustedTotal)throw new Error("PAYMENT_EXCEEDS_BALANCE");const pid=id();db.prepare("INSERT INTO payments(id,tenant_id,invoice_id,amount_pkr,method,reference) VALUES(?,?,?,?,?,?)").run(pid,q.user.tenant_id,current.id,a,b.method,b.reference||null);db.prepare("UPDATE invoices SET status=? WHERE id=? AND tenant_id=?").run(netPaid+a>=adjustedTotal?"paid":"partial",current.id,q.user.tenant_id);audit(q.user,"create","payment",pid);return db.prepare("SELECT * FROM payments WHERE id=?").get(pid);});}catch(e){if(e.message==="INVOICE_NOT_FOUND")return fail(r,404,"Invoice not found.");if(e.message==="PAYMENT_EXCEEDS_BALANCE")return fail(r,400,"Payment exceeds remaining balance.");throw e;}r.status(201).json({success:true,data:payment});});
app.get("/api/v1/tickets",auth,(q,r)=>r.json({success:true,data:db.prepare("SELECT t.*,c.full_name customer_name,u.full_name assigned_to_name FROM support_tickets t JOIN customers c ON c.id=t.customer_id LEFT JOIN users u ON u.id=t.assigned_to WHERE t.tenant_id=? ORDER BY t.created_at DESC").all(q.user.tenant_id)}));
app.get("/api/v1/tickets/:id/history",auth,(q,r)=>{const t=db.prepare("SELECT id FROM support_tickets WHERE id=? AND tenant_id=?").get(q.params.id,q.user.tenant_id);if(!t)return fail(r,404,"Ticket not found.");r.json({success:true,data:db.prepare("SELECT h.id,h.action,h.detail,h.created_at,u.full_name actor_name FROM ticket_history h LEFT JOIN users u ON u.id=h.actor_user_id WHERE h.tenant_id=? AND h.ticket_id=? ORDER BY h.created_at,h.rowid").all(q.user.tenant_id,t.id)});});
app.post("/api/v1/tickets",auth,(q,r)=>{const b=q.body||{};if(!required(b.customerId)||!required(b.subject))return fail(r,400,"Customer and subject required.");if(!db.prepare("SELECT id FROM customers WHERE id=? AND tenant_id=?").get(b.customerId,q.user.tenant_id))return fail(r,404,"Customer not found.");const tid=id(),p=["low","normal","high","urgent"].includes(b.priority)?b.priority:"normal";db.prepare("INSERT INTO support_tickets(id,tenant_id,customer_id,subject,description,priority) VALUES(?,?,?,?,?,?)").run(tid,q.user.tenant_id,b.customerId,b.subject.trim(),b.description||null,p);db.prepare("INSERT INTO ticket_history(id,tenant_id,ticket_id,actor_user_id,action,detail) VALUES(?,?,?,?,?,?)").run(id(),q.user.tenant_id,tid,q.user.id,"created","priority="+p);audit(q.user,"create","ticket",tid);r.status(201).json({success:true,data:db.prepare("SELECT * FROM support_tickets WHERE id=?").get(tid)});});
app.patch("/api/v1/tickets/:id",auth,(q,r)=>{const t=db.prepare("SELECT * FROM support_tickets WHERE id=? AND tenant_id=?").get(q.params.id,q.user.tenant_id);if(!t)return fail(r,404,"Ticket not found.");const b=q.body||{},hasS=b.status!==undefined,hasA=Object.prototype.hasOwnProperty.call(b,"assignedTo");if(!hasS&&!hasA)return fail(r,400,"Provide a status and/or assignedTo.");if(hasS&&!["open","in_progress","resolved","closed"].includes(b.status))return fail(r,400,"Invalid ticket status.");let assignee=t.assigned_to;if(hasA){if(b.assignedTo===null||b.assignedTo==="")assignee=null;else{const u=db.prepare("SELECT id FROM users WHERE id=? AND tenant_id=? AND status='active'").get(String(b.assignedTo),q.user.tenant_id);if(!u)return fail(r,400,"Assignee must be an active staff member of this workspace.");assignee=u.id;}}const status=hasS?b.status:t.status,resolvedAt=["resolved","closed"].includes(status)?(t.resolved_at||new Date().toISOString()):null;withTransaction(db,()=>{db.prepare("UPDATE support_tickets SET status=?,assigned_to=?,resolved_at=? WHERE id=? AND tenant_id=?").run(status,assignee,resolvedAt,t.id,q.user.tenant_id);if(status!==t.status)db.prepare("INSERT INTO ticket_history(id,tenant_id,ticket_id,actor_user_id,action,detail) VALUES(?,?,?,?,?,?)").run(id(),q.user.tenant_id,t.id,q.user.id,"status_changed",t.status+" -> "+status);if(assignee!==t.assigned_to)db.prepare("INSERT INTO ticket_history(id,tenant_id,ticket_id,actor_user_id,action,detail) VALUES(?,?,?,?,?,?)").run(id(),q.user.tenant_id,t.id,q.user.id,assignee?"assigned":"unassigned",assignee||t.assigned_to);audit(q.user,"update","ticket",t.id);});r.json({success:true,data:db.prepare("SELECT * FROM support_tickets WHERE id=?").get(t.id)});});
app.get("/api/v1/audit-logs",auth,(q,r)=>r.json({success:true,data:db.prepare("SELECT * FROM audit_logs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200").all(q.user.tenant_id)}));
registerOperationsRoutes(app,{db,auth,id,audit,fail,passwordHash,cleanUser});
app.use((req,res)=>fail(res,404,"Route not found."));app.use((err,_q,res,_n)=>{console.error(err);res.status(500).json({success:false,error:"Internal server error."});});
export default app;
