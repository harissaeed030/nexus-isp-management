import { randomUUID, randomBytes, createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { withTransaction } from "../lib/transactions.js";

const id=()=>randomUUID();
const hashToken=value=>createHash("sha256").update(value).digest("hex");
const passwordHash=value=>{const salt=randomBytes(16).toString("hex");return salt+":"+scryptSync(value,salt,64).toString("hex");};
const verifyPassword=(value,stored)=>{try{const [salt,key]=stored.split(":");const actual=scryptSync(value,salt,64),expected=Buffer.from(key,"hex");return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}};
const required=value=>typeof value==="string"&&value.trim().length>0;
const safeCustomer=c=>({id:c.id,accountNumber:c.account_number||c.customer_code,fullName:c.full_name,phone:c.phone,email:c.email,address:c.service_address||c.address,coverageArea:c.coverage_area,installationDate:c.installation_date,status:c.status,connectionStatus:c.connection_status});
const templateVars=(body,customer)=>body.replace(/\{\{(name|accountNumber|phone|email)\}\}/g,(_,key)=>({name:customer.full_name,accountNumber:customer.account_number||customer.customer_code,phone:customer.phone||"",email:customer.email||""})[key]||"");
function customerAuth(db,fail){
 return (req,res,next)=>{
  const raw=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!raw)return fail(res,401,"Customer sign-in required.");
  const account=db.prepare("SELECT a.id account_id,a.tenant_id account_tenant_id,a.customer_id,a.password_hash,a.status account_status,c.* FROM customer_portal_sessions s JOIN customer_portal_accounts a ON a.id=s.account_id JOIN customers c ON c.id=a.customer_id WHERE s.token_hash=? AND s.expires_at>? AND a.status='active' AND c.status='active'").get(hashToken(raw),new Date().toISOString());
  if(!account)return fail(res,401,"Customer session expired or invalid.");
  req.portal={accountId:account.account_id,tenantId:account.account_tenant_id,customer:account};next();
 };
}
async function sendWhatsApp(env,to,body,providerTemplateName=null,languageCode="en_US",templateParameters=[]){
 if(!env.whatsappAccessToken||!env.whatsappPhoneNumberId)return {configured:false};
 const version=env.whatsappApiVersion||"v23.0";
 const response=await fetch("https://graph.facebook.com/"+version+"/"+encodeURIComponent(env.whatsappPhoneNumberId)+"/messages",{
  method:"POST",headers:{"Authorization":"Bearer "+env.whatsappAccessToken,"Content-Type":"application/json"},
  body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:String(to).replace(/[^0-9]/g,""),...(providerTemplateName?{type:"template",template:{name:providerTemplateName,language:{code:languageCode},...(templateParameters.length?{components:[{type:"body",parameters:templateParameters.map(text=>({type:"text",text}))}]}:{})}}:{type:"text",text:{preview_url:false,body}})})
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload.error?.message||"WhatsApp provider rejected the message (HTTP "+response.status+").");
 const messageId=payload.messages?.[0]?.id;if(!messageId)throw new Error("WhatsApp provider returned no message ID; delivery cannot be confirmed.");\n return {configured:true,messageId,providerStatus:payload.messages?.[0]?.message_status||"accepted"};
}
export function registerPortalRoutes(app,{db,auth,id:auditId,audit,fail,env}){
 const portalAuth=customerAuth(db,fail);
 app.post("/api/v1/customer-portal/login",(req,res)=>{
  const b=req.body||{},identity=String(b.identity||"").trim(),password=b.password;
  if(!identity||typeof password!=="string")return fail(res,400,"Account number or email and password are required.");
  const parts=identity.split("/"),tenantSlug=parts.length===2?parts[0]:null,key=parts.length===2?parts[1]:identity;
  const matches=db.prepare("SELECT a.*,c.tenant_id customer_tenant,c.email,c.account_number,c.customer_code FROM customer_portal_accounts a JOIN customers c ON c.id=a.customer_id JOIN tenants t ON t.id=c.tenant_id WHERE (((c.account_number=? OR c.customer_code=?) AND (? IS NULL OR t.slug=?)) OR c.email=? COLLATE NOCASE) AND a.status='active' AND c.status='active' ORDER BY a.created_at LIMIT 2").all(key,key,tenantSlug,tenantSlug,identity);
  if(matches.length>1)return fail(res,409,"This account number exists in more than one ISP. Sign in with tenant-slug/account-number or use your unique customer email.");
  const account=matches[0];
  if(!account||!verifyPassword(password,account.password_hash))return fail(res,401,"Invalid customer login details.");
  const token=randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO customer_portal_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").run(hashToken(token),account.id,new Date(Date.now()+7*86400000).toISOString());
  db.prepare("UPDATE customer_portal_accounts SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").run(account.id);
  res.json({success:true,token,customer:{id:account.customer_id,accountNumber:account.account_number||account.customer_code}});
 });
 app.post("/api/v1/customer-portal/logout",portalAuth,(req,res)=>{
  const raw=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  db.prepare("DELETE FROM customer_portal_sessions WHERE token_hash=?").run(hashToken(raw));res.json({success:true});
 });
 app.get("/api/v1/customer-portal/me",portalAuth,(req,res)=>{
  const c=req.portal.customer;
  const active=db.prepare("SELECT s.id,s.status,s.started_at,s.expires_at,p.name package_name,p.speed_down_mbps,p.speed_up_mbps,p.monthly_price_pkr FROM subscriptions s JOIN packages p ON p.id=s.package_id WHERE s.tenant_id=? AND s.customer_id=? AND s.status='active' ORDER BY s.created_at DESC LIMIT 1").get(req.portal.tenantId,c.id)||null;
  res.json({success:true,data:{customer:safeCustomer(c),activePackage:active}});
 });
 app.get("/api/v1/customer-portal/invoices",portalAuth,(req,res)=>{
  const rows=db.prepare("SELECT i.*,COALESCE((SELECT SUM(p.amount_pkr) FROM payments p WHERE p.invoice_id=i.id AND p.tenant_id=i.tenant_id),0) paid_pkr FROM invoices i WHERE i.tenant_id=? AND i.customer_id=? ORDER BY i.created_at DESC").all(req.portal.tenantId,req.portal.customer.id);
  res.json({success:true,data:rows.map(x=>({...x,outstanding_pkr:Math.max(0,x.amount_pkr-x.paid_pkr)}))});
 });
 app.get("/api/v1/customer-portal/payments",portalAuth,(req,res)=>{
  res.json({success:true,data:db.prepare("SELECT p.id,p.amount_pkr,p.method,p.reference,p.received_at,i.invoice_number FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.tenant_id=? AND i.customer_id=? ORDER BY p.received_at DESC").all(req.portal.tenantId,req.portal.customer.id)});
 });
 app.get("/api/v1/customer-portal/complaints",portalAuth,(req,res)=>{
  res.json({success:true,data:db.prepare("SELECT id,subject,description,priority,status,created_at FROM support_tickets WHERE tenant_id=? AND customer_id=? ORDER BY created_at DESC").all(req.portal.tenantId,req.portal.customer.id)});
 });
 app.post("/api/v1/customer-portal/complaints",portalAuth,(req,res)=>{
  const b=req.body||{},subject=String(b.subject||"").trim(),description=String(b.description||"").trim(),priority=["low","normal","high","urgent"].includes(b.priority)?b.priority:"normal";
  if(!subject||subject.length>180||description.length>3000)return fail(res,400,"A complaint subject (max 180 characters) and details (max 3000 characters) are required.");
  const ticketId=id();
  db.prepare("INSERT INTO support_tickets(id,tenant_id,customer_id,subject,description,priority) VALUES(?,?,?,?,?,?)").run(ticketId,req.portal.tenantId,req.portal.customer.id,subject,description,priority);
  res.status(201).json({success:true,data:db.prepare("SELECT id,subject,description,priority,status,created_at FROM support_tickets WHERE id=?").get(ticketId)});
 });
 // Staff-managed customer portal account provisioning.
 app.post("/api/v1/portal-admin/customers/:customerId/account",auth,(req,res)=>{
  const customer=db.prepare("SELECT * FROM customers WHERE id=? AND tenant_id=?").get(req.params.customerId,req.user.tenant_id);
  if(!customer)return fail(res,404,"Customer not found.");
  const password=req.body?.password;
  if(typeof password!=="string"||password.length<10||password.length>200)return fail(res,400,"Portal password must be 10-200 characters.");
  const existing=db.prepare("SELECT id FROM customer_portal_accounts WHERE tenant_id=? AND customer_id=?").get(req.user.tenant_id,customer.id);
  if(existing)return fail(res,409,"A portal account already exists. Use password reset instead.");
  const accountId=id();
  db.prepare("INSERT INTO customer_portal_accounts(id,tenant_id,customer_id,password_hash) VALUES(?,?,?,?)").run(accountId,req.user.tenant_id,customer.id,passwordHash(password));
  audit(req.user,"create","customer_portal_account",accountId);
  res.status(201).json({success:true,data:{id:accountId,customerId:customer.id,accountNumber:customer.account_number||customer.customer_code,status:"active"}});
 });
 app.post("/api/v1/portal-admin/customers/:customerId/reset-password",auth,(req,res)=>{
  const customer=db.prepare("SELECT id FROM customers WHERE id=? AND tenant_id=?").get(req.params.customerId,req.user.tenant_id);
  if(!customer)return fail(res,404,"Customer not found.");
  const password=req.body?.password;
  if(typeof password!=="string"||password.length<10||password.length>200)return fail(res,400,"Portal password must be 10-200 characters.");
  const account=db.prepare("SELECT id FROM customer_portal_accounts WHERE tenant_id=? AND customer_id=?").get(req.user.tenant_id,customer.id);
  if(!account)return fail(res,404,"Customer portal account not found.");
  withTransaction(db,()=>{db.prepare("UPDATE customer_portal_accounts SET password_hash=? WHERE id=?").run(passwordHash(password),account.id);db.prepare("DELETE FROM customer_portal_sessions WHERE account_id=?").run(account.id);});
  res.json({success:true,message:"Password reset. Existing customer sessions were revoked."});
 });
 app.get("/api/v1/notifications/templates",auth,(req,res)=>{
  res.json({success:true,data:db.prepare("SELECT * FROM notification_templates WHERE tenant_id=? ORDER BY event_key").all(req.user.tenant_id)});
 });
 app.post("/api/v1/notifications/templates",auth,(req,res)=>{
  const b=req.body||{},name=String(b.name||"").trim(),eventKey=String(b.eventKey||"").trim(),body=String(b.body||"").trim(),channel=b.channel||"whatsapp",providerName=String(b.providerTemplateName||"").trim(),language=String(b.languageCode||"en_US").trim();
  if(!name||name.length>100||!/^[a-z][a-z0-9_.-]{1,79}$/.test(eventKey)||!body||body.length>4096||channel!=="whatsapp")return fail(res,400,"Provide a template name, valid event key and WhatsApp message body (max 4096 characters).");
  const tid=id();
  try{db.prepare("INSERT INTO notification_templates(id,tenant_id,name,event_key,channel,body,provider_template_name,language_code,enabled) VALUES(?,?,?,?,?,?,?,?,?)").run(tid,req.user.tenant_id,name,eventKey,channel,body,providerName||null,language,b.enabled===false?0:1);}
  catch(e){if(String(e.message).includes("UNIQUE"))return fail(res,409,"A template already exists for this event and channel.");throw e;}
  res.status(201).json({success:true,data:db.prepare("SELECT * FROM notification_templates WHERE id=?").get(tid)});
 });
 app.patch("/api/v1/notifications/templates/:id",auth,(req,res)=>{
  const row=db.prepare("SELECT * FROM notification_templates WHERE id=? AND tenant_id=?").get(req.params.id,req.user.tenant_id);
  if(!row)return fail(res,404,"Template not found.");
  const name=String(req.body?.name??row.name).trim(),body=String(req.body?.body??row.body).trim(),providerName=String(req.body?.providerTemplateName??row.provider_template_name??"").trim(),language=String(req.body?.languageCode??row.language_code??"en_US").trim(),enabled=req.body?.enabled===undefined?row.enabled:(req.body.enabled?1:0);
  if(!name||name.length>100||!body||body.length>4096)return fail(res,400,"Invalid template name or body.");
  db.prepare("UPDATE notification_templates SET name=?,body=?,provider_template_name=?,language_code=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").run(name,body,providerName||null,language,enabled,row.id,req.user.tenant_id);
  res.json({success:true,data:db.prepare("SELECT * FROM notification_templates WHERE id=?").get(row.id)});
 });
 app.get("/api/v1/notifications/outbox",auth,(req,res)=>{
  const data=db.prepare("SELECT n.*,c.full_name customer_name FROM notification_outbox n LEFT JOIN customers c ON c.id=n.customer_id WHERE n.tenant_id=? ORDER BY n.created_at DESC LIMIT 250").all(req.user.tenant_id);
  res.json({success:true,data});
 });
 app.post("/api/v1/notifications/queue",auth,(req,res)=>{
  const b=req.body||{},customer=db.prepare("SELECT * FROM customers WHERE id=? AND tenant_id=?").get(b.customerId,req.user.tenant_id);
  if(!customer)return fail(res,404,"Customer not found.");
  const template=db.prepare("SELECT * FROM notification_templates WHERE id=? AND tenant_id=? AND enabled=1").get(b.templateId,req.user.tenant_id);
  if(!template)return fail(res,404,"Enabled notification template not found.");
  if(!customer.phone)return fail(res,400,"Customer phone number is missing.");
  const nid=id(),body=templateVars(template.body,customer),keys=[...template.body.matchAll(/\{\{(name|accountNumber|phone|email)\}\}/g)].map(x=>x[1]),values={name:customer.full_name,accountNumber:customer.account_number||customer.customer_code,phone:customer.phone||"",email:customer.email||""},parameters=keys.map(k=>String(values[k]??""));
  db.prepare("INSERT INTO notification_outbox(id,tenant_id,customer_id,template_id,channel,destination,body,provider_template_name,language_code,template_parameters,status,next_attempt_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(nid,req.user.tenant_id,customer.id,template.id,"whatsapp",customer.phone,body,template.provider_template_name,template.language_code,JSON.stringify(parameters),"queued",new Date().toISOString());
  res.status(202).json({success:true,data:{id:nid,status:"queued"}});
 });
 const deliver=async(notification,tenantId)=>{
  const result=await sendWhatsApp(env,notification.destination,notification.body,notification.provider_template_name,notification.language_code||"en_US",JSON.parse(notification.template_parameters||"[]"));
  if(!result.configured)throw new Error("WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server.");
  db.prepare("UPDATE notification_outbox SET status='sent',provider_message_id=?,provider_status=?,attempts=attempts+1,sent_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").run(result.messageId,result.providerStatus,notification.id,tenantId);
  return result;
 };
 app.post("/api/v1/notifications/outbox/:id/send",auth,async(req,res)=>{
  const item=db.prepare("SELECT * FROM notification_outbox WHERE id=? AND tenant_id=?").get(req.params.id,req.user.tenant_id);
  if(!item)return fail(res,404,"Notification not found.");
  if(!["queued","failed"].includes(item.status))return fail(res,409,"Only queued or failed notifications can be sent or retried.");
  try{const result=await deliver(item,req.user.tenant_id);res.json({success:true,data:{id:item.id,status:"sent",providerMessageId:result.messageId,providerStatus:result.providerStatus}});}
  catch(error){const attempts=item.attempts+1,status=attempts>=item.max_attempts?"failed":"retry";const delay=Math.min(3600,30*2**Math.min(attempts,7));db.prepare("UPDATE notification_outbox SET status=?,attempts=?,last_error=?,next_attempt_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").run(status,attempts,error.message,new Date(Date.now()+delay*1000).toISOString(),item.id,req.user.tenant_id);return fail(res,502,"Provider send failed; notification was not marked delivered. "+error.message);}
 });
 app.post("/api/v1/notifications/outbox/:id/retry",auth,(req,res)=>{
  const item=db.prepare("SELECT * FROM notification_outbox WHERE id=? AND tenant_id=?").get(req.params.id,req.user.tenant_id);
  if(!item)return fail(res,404,"Notification not found.");
  if(!["failed","retry"].includes(item.status))return fail(res,409,"Only failed or retryable notifications can be re-queued.");
  db.prepare("UPDATE notification_outbox SET status='queued',next_attempt_at=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").run(new Date().toISOString(),item.id,req.user.tenant_id);
  res.json({success:true,data:{id:item.id,status:"queued"}});
 });
 // Meta webhook callbacks are verified by the configured verify token and update delivery states only on provider callbacks.
 app.get("/api/v1/notifications/whatsapp/webhook",(req,res)=>{
  if(!env.whatsappVerifyToken||req.query["hub.verify_token"]!==env.whatsappVerifyToken)return fail(res,403,"Webhook verification failed.");
  if(req.query["hub.mode"]==="subscribe"&&req.query["hub.challenge"])return res.status(200).send(String(req.query["hub.challenge"]));
  return fail(res,400,"Invalid webhook verification request.");
 });
 app.post("/api/v1/notifications/whatsapp/webhook",(req,res)=>{
  if(!env.whatsappAppSecret)return fail(res,503,"WhatsApp webhook signature secret is not configured.");
  const signature=String(req.headers["x-hub-signature-256"]||"");
  const expected="sha256="+createHmac("sha256",env.whatsappAppSecret).update(req.rawBody||Buffer.from(JSON.stringify(req.body||{}))).digest("hex");
  const left=Buffer.from(signature),right=Buffer.from(expected);
  if(left.length!==right.length||!timingSafeEqual(left,right))return fail(res,401,"Invalid WhatsApp webhook signature.");
  const entries=req.body?.entry||[];
  for(const entry of entries)for(const change of entry.changes||[])for(const status of change.value?.statuses||[]){
   const messageId=status.id,state=status.status;
   if(!messageId||!["sent","delivered","read","failed"].includes(state))continue;
   db.prepare("UPDATE notification_outbox SET status=?,provider_status=?,delivered_at=CASE WHEN ? IN ('delivered','read') THEN CURRENT_TIMESTAMP ELSE delivered_at END,last_error=CASE WHEN ?='failed' THEN ? ELSE last_error END,updated_at=CURRENT_TIMESTAMP WHERE provider_message_id=?").run(state==="read"?"delivered":state,state,state,state,status.errors?.[0]?.title||"Provider reported failure",messageId);
  }
  res.sendStatus(200);
 });
}
