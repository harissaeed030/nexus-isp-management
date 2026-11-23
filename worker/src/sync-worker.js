import { createD1Adapter, createTenantRepository, schemaFor } from "../../shared/database/index.js";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const ORDER = ["customers","packages","subscriptions","invoices","payments"];
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
async function sha256(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
async function equalSecret(a,b){if(!a||!b)return false;const [x,y]=await Promise.all([sha256(a),sha256(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;}
function clean(v){return typeof v==="string"?v.trim():v;}
function statusCustomer(v){return v==="active"?"active":"suspended";}
function statusSubscription(v){return ["active","suspended","cancelled","expired"].includes(v)?v:"active";}
function statusInvoice(v){return v==="paid"?"paid":v==="overdue"?"overdue":v==="cancelled"?"cancelled":"pending";}
function paymentMethod(v){return v==="cash"?"cash":v==="bank"?"bank_transfer":v==="jazzcash"||v==="easypaisa"?"mobile_money":v==="bank_transfer"?"bank_transfer":v==="mobile_money"?"mobile_money":"other";}
function changedAt(e){return e.changedAt||new Date().toISOString();}

export async function getTenantMapping(database, sourceTenantId) {
  return database.prepare("SELECT organization_id FROM sync_tenant_mappings WHERE source_tenant_id=? AND active=1").bind(sourceTenantId).first();
}

export function validateSyncBatch(sourceTenantId, events) {
  if (!sourceTenantId || sourceTenantId.length > 128 || !Array.isArray(events) || events.length < 1 || events.length > 50) {
    return "sourceTenantId and 1-50 events are required";
  }
  const seenOperations = new Set();
  let previousCursor = 0;
  for (const event of events) {
    if (!event || !Number.isSafeInteger(event.cursor) || event.cursor <= previousCursor) {
      return "Events must be ordered by strictly increasing cursor";
    }
    if (typeof event.operationId !== "string" || !event.operationId || seenOperations.has(event.operationId)) {
      return "Each event must have a unique operationId";
    }
    seenOperations.add(event.operationId);
    previousCursor = event.cursor;
  }
  return null;
}
async function applyEvent(env,orgId,sourceTenantId,event,repository){
  const type=event.entityType, id=String(event.entityId||""), opId=String(event.operationId||"");
  if(!ORDER.includes(type)||!["upsert","delete"].includes(event.operation)||!id||id.length>128||!opId||opId.length>128||!Number.isSafeInteger(event.cursor)||event.cursor<1)throw new Error("Malformed sync event.");
  const hash=await sha256(JSON.stringify(event));
  const prior=await env.DB.prepare("SELECT payload_hash FROM sync_operations WHERE operation_id=?").bind(opId).first();
  if(prior){if(prior.payload_hash!==hash)throw new Error("Idempotency key reused with a different payload.");return {applied:0,duplicate:1};}
  const table=type;
  const existing=await repository.get(type,orgId,id);
  if(existing&&existing.organization_id!==orgId)throw new Error("Record ID already belongs to another organization.");
  let statement;
  if(event.operation==="delete"){
    if(type==="payments")throw new Error("Payment ledger entries cannot be deleted by sync.");
    if(type==="customers")statement=env.DB.prepare("UPDATE customers SET status='terminated',updated_at=? WHERE id=? AND organization_id=?").bind(changedAt(event),id,orgId);
    if(type==="packages")statement=env.DB.prepare("UPDATE packages SET is_active=0,updated_at=? WHERE id=? AND organization_id=?").bind(changedAt(event),id,orgId);
    if(type==="subscriptions")statement=env.DB.prepare("UPDATE subscriptions SET status='cancelled',updated_at=? WHERE id=? AND organization_id=?").bind(changedAt(event),id,orgId);
    if(type==="invoices"){
      const inv=await env.DB.prepare("SELECT status FROM invoices WHERE id=? AND organization_id=?").bind(id,orgId).first();
      if(inv?.status==="paid")throw new Error("A paid invoice cannot be deleted by sync.");
      statement=env.DB.prepare("UPDATE invoices SET status='cancelled',updated_at=? WHERE id=? AND organization_id=?").bind(changedAt(event),id,orgId);
    }
  }else{
    const r=event.record;
    if(!r||r.id!==id||r.tenant_id!==sourceTenantId)throw new Error("Snapshot identity or tenant mismatch.");
    if(type==="customers"){
      const full=clean(r.full_name||"").trim(), split=full.indexOf(" "), first=split<0?full:full.slice(0,split), last=split<0?"":full.slice(split+1);
      if(!first)throw new Error("Customer name is required.");
      const customerCode=r.account_number||r.customer_code||null;
      if(customerCode){const sameCode=await env.DB.prepare("SELECT id FROM customers WHERE organization_id=? AND customer_code=?").bind(orgId,customerCode).first();if(sameCode&&sameCode.id!==id)throw new Error("Customer code already exists in D1 under a different ID; reconcile before syncing.");}
      statement=env.DB.prepare(`INSERT INTO customers(id,organization_id,first_name,last_name,email,phone,address,status,customer_code,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=excluded.phone,address=excluded.address,status=excluded.status,customer_code=excluded.customer_code,updated_at=excluded.updated_at
        WHERE customers.organization_id=excluded.organization_id AND excluded.updated_at>=customers.updated_at`)
        .bind(id,orgId,first,last,r.email||null,r.phone||null,r.service_address||r.address||null,statusCustomer(r.status),r.account_number||r.customer_code||null,r.created_at||changedAt(event),changedAt(event));
    }else if(type==="packages"){
      const down=Number(r.speed_down_mbps),up=Number(r.speed_up_mbps),price=Number(r.monthly_price_pkr);
      if(!Number.isInteger(down)||down<1||!Number.isInteger(up)||up<1||!Number.isFinite(price)||price<0)throw new Error("Invalid package speed or PKR price.");
      statement=env.DB.prepare(`INSERT INTO packages(id,organization_id,name,speed_mbps,price,billing_cycle,is_active,created_at,updated_at,speed_down,speed_up)
        VALUES(?,?,?,?,?,'monthly',?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,speed_mbps=excluded.speed_mbps,price=excluded.price,is_active=excluded.is_active,updated_at=excluded.updated_at,speed_down=excluded.speed_down,speed_up=excluded.speed_up
        WHERE packages.organization_id=excluded.organization_id AND excluded.updated_at>=packages.updated_at`)
        .bind(id,orgId,r.name,down,price,r.status==="active"?1:0,r.created_at||changedAt(event),changedAt(event),String(down),String(up));
    }else if(type==="subscriptions"){
      const customer=await env.DB.prepare("SELECT id FROM customers WHERE id=? AND organization_id=?").bind(r.customer_id,orgId).first();
      const pkg=await env.DB.prepare("SELECT id FROM packages WHERE id=? AND organization_id=?").bind(r.package_id,orgId).first();
      if(!customer||!pkg)throw new Error("Subscription customer or package is not synced to this organization.");
      statement=env.DB.prepare(`INSERT INTO subscriptions(id,organization_id,customer_id,package_id,status,start_date,end_date,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status,end_date=excluded.end_date,updated_at=excluded.updated_at
        WHERE subscriptions.organization_id=excluded.organization_id AND subscriptions.customer_id=excluded.customer_id AND subscriptions.package_id=excluded.package_id AND excluded.updated_at>=subscriptions.updated_at`)
        .bind(id,orgId,r.customer_id,r.package_id,statusSubscription(r.status),r.started_at||r.created_at||changedAt(event),r.expires_at||null,r.created_at||changedAt(event),changedAt(event));
    }else if(type==="invoices"){
      const customer=await env.DB.prepare("SELECT id FROM customers WHERE id=? AND organization_id=?").bind(r.customer_id,orgId).first();
      if(!customer)throw new Error("Invoice customer is not synced to this organization.");
      const amount=Number(r.amount_pkr), due=r.due_date||String(r.created_at||changedAt(event)).slice(0,10);
      if(!Number.isFinite(amount)||amount<0||!r.invoice_number)throw new Error("Invalid invoice number or amount.");
      if(existing){
        const old=await env.DB.prepare("SELECT customer_id,invoice_number,amount,total,status FROM invoices WHERE id=? AND organization_id=?").bind(id,orgId).first();
        if(old.customer_id!==r.customer_id||old.invoice_number!==r.invoice_number||Number(old.amount)!==amount||Number(old.total)!==amount)throw new Error("Issued invoice identity and total are immutable; manual reconciliation is required.");
        statement=env.DB.prepare("UPDATE invoices SET status=CASE WHEN status='paid' THEN status ELSE ? END,due_date=?,updated_at=? WHERE id=? AND organization_id=?").bind(statusInvoice(r.status),due,changedAt(event),id,orgId);
      }else{
        statement=env.DB.prepare("INSERT INTO invoices(id,organization_id,customer_id,invoice_number,amount,tax,total,status,issue_date,due_date,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?,?,?,?,?)")
          .bind(id,orgId,r.customer_id,r.invoice_number,amount,amount,statusInvoice(r.status),String(r.created_at||changedAt(event)).slice(0,10),due,r.created_at||changedAt(event),changedAt(event));
      }
    }else if(type==="payments"){
      const inv=await env.DB.prepare("SELECT customer_id FROM invoices WHERE id=? AND organization_id=?").bind(r.invoice_id,orgId).first();
      if(!inv)throw new Error("Payment invoice is not synced to this organization.");
      const amount=Number(r.amount_pkr), method=paymentMethod(r.method);
      if(!Number.isInteger(amount)||amount<=0)throw new Error("Invalid payment amount.");
      if(existing){
        const old=await env.DB.prepare("SELECT invoice_id,customer_id,amount,payment_method,transaction_ref,paid_at FROM payments WHERE id=? AND organization_id=?").bind(id,orgId).first();
        if(old.invoice_id!==r.invoice_id||old.customer_id!==inv.customer_id||Number(old.amount)!==amount||old.payment_method!==method||(old.transaction_ref||null)!==(r.reference||null)||(old.paid_at||null)!==(r.received_at||changedAt(event)))throw new Error("Payment is immutable and differs from the existing ledger entry.");
        statement=null;
      }else{
        if(r.reference){
          const ref=await env.DB.prepare("SELECT id FROM payments WHERE organization_id=? AND transaction_ref=?").bind(orgId,r.reference).first();
          if(ref&&ref.id!==id)throw new Error("Payment reference already exists in D1.");
        }
        statement=env.DB.prepare("INSERT INTO payments(id,organization_id,invoice_id,customer_id,amount,payment_method,transaction_ref,status,paid_at,created_at) VALUES(?,?,?,?,?,?,?,'completed',?,?)")
          .bind(id,orgId,r.invoice_id,inv.customer_id,amount,method,r.reference||null,r.received_at||changedAt(event),r.received_at||changedAt(event));
      }
    }
  }
  const ledger=env.DB.prepare("INSERT INTO sync_operations(operation_id,organization_id,entity_type,entity_id,payload_hash) VALUES(?,?,?,?,?)")
    .bind(opId,orgId,type,id,hash);
  if(statement)await env.DB.batch([statement,ledger]);else await ledger.run();
  return {applied:1,duplicate:0};
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/health")return json({success:true,service:"NEXUS SQLite-to-D1 sync",database:env.DB?"configured":"missing"});
  if(request.method!=="POST"||url.pathname!=="/sync/push")return json({success:false,error:"Not found"},404);
  const bearer=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!await equalSecret(bearer,env.SYNC_PUSH_TOKEN))return json({success:false,error:"Authentication failed"},401);
  if(!env.DB)return json({success:false,error:"D1 binding missing"},503);
  // Enforce the payload limit on bytes actually received; Content-Length may be absent or untrusted.
  let rawBody;
  try { rawBody = await request.text(); } catch { return json({success:false,error:"Unable to read request body"},400); }
  if (new TextEncoder().encode(rawBody).byteLength > 900000) return json({success:false,error:"Batch too large"},413);
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({success:false,error:"Invalid JSON"},400); }
  const sourceTenantId=String(body?.sourceTenantId||"");
  const events=body?.events;
  const batchError = validateSyncBatch(sourceTenantId, events);
  if (batchError) return json({success:false,error:batchError},400);
  const mapping=await getTenantMapping(env.DB,sourceTenantId);
  if(!mapping)return json({success:false,error:"No approved SQLite tenant mapping exists. Provision and verify the source tenant to D1 organization mapping before syncing."},409);
  const organization=await env.DB.prepare("SELECT currency FROM organizations WHERE id=?").bind(mapping.organization_id).first();
  if(!organization||organization.currency!=="PKR")return json({success:false,error:"D1 organization currency must be PKR before importing PKR-denominated SQLite records"},409);
  const repository = createTenantRepository(createD1Adapter(env.DB), schemaFor("d1"));
  let applied=0,duplicates=0,ackCursor=0;
  try{
    for(const event of events){
      const result=await applyEvent(env,mapping.organization_id,sourceTenantId,event,repository);
      applied+=result.applied;duplicates+=result.duplicate;ackCursor=Math.max(ackCursor,Number(event.cursor)||0);
    }
    return json({success:true,organizationId:mapping.organization_id,applied,duplicates,ackCursor});
  }catch(error){
    return json({success:false,error:error?.message||"Sync rejected",applied,duplicates,ackCursor},409);
  }
 }
};
