import { withTransaction } from "../lib/transactions.js";

const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
const validEmail = value => value == null || value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const customerStatuses = new Set(["active","inactive","blocked"]);
const connectionStatuses = new Set(["pending","active","suspended","disconnected"]);
const subscriptionStatuses = new Set(["pending","active","suspended","cancelled","expired"]);
const like = value => "%" + String(value) + "%";

export function registerCustomerRoutes(app,{db,auth,id,audit,fail}) {
  const getCustomer = (customerId,tenantId) => db.prepare("SELECT * FROM customers WHERE id=? AND tenant_id=?").get(customerId,tenantId);
  const getSubscription = (subscriptionId,tenantId) => db.prepare("SELECT * FROM subscriptions WHERE id=? AND tenant_id=?").get(subscriptionId,tenantId);
  const expireDueSubscriptions = user => {
    const today=new Date().toISOString().slice(0,10);
    const due=db.prepare("SELECT * FROM subscriptions WHERE tenant_id=? AND status='active' AND expires_at IS NOT NULL AND expires_at<?").all(user.tenant_id,today);
    if(!due.length)return;
    withTransaction(db,()=>{
      for(const sub of due){
        db.prepare("UPDATE subscriptions SET status='expired' WHERE id=? AND tenant_id=?").run(sub.id,user.tenant_id);
        addSubHistory(user,sub,"expired",sub.status,"expired","Subscription expiry date passed");
        const customer=getCustomer(sub.customer_id,user.tenant_id);
        const other=db.prepare("SELECT COUNT(*) count FROM subscriptions WHERE tenant_id=? AND customer_id=? AND id<>? AND status='active' AND (expires_at IS NULL OR expires_at>=?)").get(user.tenant_id,customer.id,sub.id,today).count;
        if(!other&&customer.connection_status==="active"){
          db.prepare("UPDATE customers SET connection_status='disconnected' WHERE id=? AND tenant_id=?").run(customer.id,user.tenant_id);
          addConnectionHistory(user,customer,"subscription_expired","active","disconnected");
        }
        audit(user,"expire","subscription",sub.id);
      }
    });
  };
  const addSubHistory = (user,sub,event,oldValue,newValue,notes=null) => db.prepare(
    "INSERT INTO subscription_history(id,tenant_id,subscription_id,customer_id,event_type,old_value,new_value,notes,actor_user_id) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(id(),user.tenant_id,sub.id,sub.customer_id,event,oldValue==null?null:String(oldValue),newValue==null?null:String(newValue),notes,user.id);
  const addConnectionHistory = (user,customer,event,oldStatus,newStatus,notes=null) => db.prepare(
    "INSERT INTO customer_connection_history(id,tenant_id,customer_id,event_type,old_status,new_status,notes,actor_user_id) VALUES(?,?,?,?,?,?,?,?)"
  ).run(id(),user.tenant_id,customer.id,event,oldStatus||null,newStatus||null,notes,user.id);

  app.get("/api/v1/customers",auth,(req,res)=>{
    const tenant=req.user.tenant_id, q=clean(req.query.q||""), status=req.query.status||"", connection=req.query.connectionStatus||"", area=req.query.coverageArea||"";
    const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page||"1",10)||1));
    const pageSize=Math.max(1,Math.min(100,Number.parseInt(req.query.pageSize||"20",10)||20));
    if(status&&!customerStatuses.has(status))return fail(res,400,"Invalid customer status filter.");
    if(connection&&!connectionStatuses.has(connection))return fail(res,400,"Invalid connection status filter.");
    const where=["tenant_id=?"],params=[tenant];
    if(q){where.push("(full_name LIKE ? OR customer_code LIKE ? OR account_number LIKE ? OR phone LIKE ? OR email LIKE ? OR address LIKE ? OR service_address LIKE ? OR coverage_area LIKE ?)");params.push(...Array(8).fill(like(q)));}
    if(status){where.push("status=?");params.push(status);}
    if(connection){where.push("connection_status=?");params.push(connection);}
    if(area){where.push("coverage_area=?");params.push(area);}
    const clause=where.join(" AND "), total=db.prepare("SELECT COUNT(*) count FROM customers WHERE "+clause).get(...params).count;
    const data=db.prepare("SELECT * FROM customers WHERE "+clause+" ORDER BY created_at DESC LIMIT ? OFFSET ?").all(...params,pageSize,(page-1)*pageSize);
    res.json({success:true,data,pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize)}});
  });

  app.post("/api/v1/customers",auth,(req,res)=>{
    const b=req.body||{},name=clean(b.fullName),phone=clean(b.phone||""),email=clean(b.email||"");
    const address=clean(b.address||""),serviceAddress=clean(b.serviceAddress||b.address||""),area=clean(b.coverageArea||"");
    const status=b.status||"active",connection=b.connectionStatus||"pending";
    if(typeof name!=="string"||!name||name.length>160)return fail(res,400,"Customer name is required (maximum 160 characters).");
    if(typeof phone!=="string"||phone.length>40||typeof email!=="string"||!validEmail(email)||email.length>254)return fail(res,400,"Enter a valid email and phone number.");
    if(!customerStatuses.has(status)||!connectionStatuses.has(connection))return fail(res,400,"Invalid customer or connection status.");
    if(b.installationDate&&!validDate(b.installationDate))return fail(res,400,"Installation date must use YYYY-MM-DD.");
    const customerId=id();
    try {
      const created=withTransaction(db,()=>{
        db.prepare("INSERT OR IGNORE INTO tenant_customer_sequences(tenant_id,next_value) VALUES(?,1)").run(req.user.tenant_id);
        const storedNext=db.prepare("SELECT next_value FROM tenant_customer_sequences WHERE tenant_id=?").get(req.user.tenant_id).next_value;
        const existingMax=db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(account_number,5) AS INTEGER)),0) value FROM customers WHERE tenant_id=? AND account_number GLOB 'NXS-[0-9]*'").get(req.user.tenant_id).value;
        const sequence=Math.max(storedNext,existingMax+1);
        const accountNumber="NXS-"+String(sequence).padStart(7,"0");
        db.prepare("UPDATE tenant_customer_sequences SET next_value=? WHERE tenant_id=?").run(sequence+1,req.user.tenant_id);
        db.prepare("INSERT INTO customers(id,tenant_id,customer_code,account_number,full_name,phone,email,address,service_address,coverage_area,installation_date,status,connection_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(customerId,req.user.tenant_id,accountNumber,accountNumber,name,phone||null,email||null,address||null,serviceAddress||null,area||null,b.installationDate||null,status,connection);
        const customer=getCustomer(customerId,req.user.tenant_id);
        addConnectionHistory(req.user,customer,"registered",null,connection,"Customer account created");
        audit(req.user,"create","customer",customerId);
        return customer;
      });
      res.status(201).json({success:true,data:created});
    } catch(error) {
      if(String(error.message).includes("UNIQUE"))return fail(res,409,"Customer account number already exists. Retry the request.");
      throw error;
    }
  });

  app.get("/api/v1/customers/:id",auth,(req,res)=>{
    const customer=getCustomer(req.params.id,req.user.tenant_id);
    return customer?res.json({success:true,data:customer}):fail(res,404,"Customer not found.");
  });

  app.get("/api/v1/customers/:id/profile",auth,(req,res)=>{
    expireDueSubscriptions(req.user);
    const tenant=req.user.tenant_id,customer=getCustomer(req.params.id,tenant);
    if(!customer)return fail(res,404,"Customer not found.");
    const subscriptions=db.prepare("SELECT s.*,p.name package_name,p.speed_down_mbps,p.speed_up_mbps,p.monthly_price_pkr FROM subscriptions s JOIN packages p ON p.id=s.package_id WHERE s.tenant_id=? AND s.customer_id=? ORDER BY s.created_at DESC").all(tenant,customer.id);
    const invoices=db.prepare("SELECT * FROM invoices WHERE tenant_id=? AND customer_id=? ORDER BY created_at DESC").all(tenant,customer.id);
    const payments=db.prepare("SELECT p.*,i.invoice_number FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.tenant_id=? AND i.customer_id=? ORDER BY p.received_at DESC").all(tenant,customer.id);
    const complaints=db.prepare("SELECT * FROM support_tickets WHERE tenant_id=? AND customer_id=? ORDER BY created_at DESC").all(tenant,customer.id);
    const connectionHistory=db.prepare("SELECT * FROM customer_connection_history WHERE tenant_id=? AND customer_id=? ORDER BY created_at DESC").all(tenant,customer.id);
    const subscriptionHistory=db.prepare("SELECT * FROM subscription_history WHERE tenant_id=? AND customer_id=? ORDER BY created_at DESC").all(tenant,customer.id);
    res.json({success:true,data:{customer,subscriptions,invoices,payments,complaints,connectionHistory,subscriptionHistory}});
  });

  app.get("/api/v1/customers/:id/history",auth,(req,res)=>{
    const tenant=req.user.tenant_id,customer=getCustomer(req.params.id,tenant);
    if(!customer)return fail(res,404,"Customer not found.");
    const connection=db.prepare("SELECT id,event_type,old_status,new_status,notes,actor_user_id,created_at,'connection' kind FROM customer_connection_history WHERE tenant_id=? AND customer_id=?").all(tenant,customer.id);
    const subscriptions=db.prepare("SELECT id,event_type,old_value,new_value,notes,actor_user_id,created_at,'subscription' kind FROM subscription_history WHERE tenant_id=? AND customer_id=?").all(tenant,customer.id);
    res.json({success:true,data:[...connection,...subscriptions].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))});
  });

  app.patch("/api/v1/customers/:id",auth,(req,res)=>{
    const customer=getCustomer(req.params.id,req.user.tenant_id);
    if(!customer)return fail(res,404,"Customer not found.");
    const b=req.body||{},v={
      name:clean(b.fullName??customer.full_name),phone:clean(b.phone??customer.phone??""),
      email:clean(b.email??customer.email??""),address:clean(b.address??customer.address??""),
      serviceAddress:clean(b.serviceAddress??customer.service_address??""),area:clean(b.coverageArea??customer.coverage_area??""),
      status:b.status??customer.status,connection:b.connectionStatus??customer.connection_status,
      installationDate:b.installationDate??customer.installation_date
    };
    if(!v.name||v.name.length>160||v.phone.length>40||!validEmail(v.email)||v.email.length>254)return fail(res,400,"Invalid customer name, phone or email.");
    if(!customerStatuses.has(v.status)||!connectionStatuses.has(v.connection))return fail(res,400,"Invalid customer or connection status.");
    if(v.installationDate&&!validDate(v.installationDate))return fail(res,400,"Installation date must use YYYY-MM-DD.");
    withTransaction(db,()=>{
      db.prepare("UPDATE customers SET full_name=?,phone=?,email=?,address=?,service_address=?,coverage_area=?,installation_date=?,status=?,connection_status=? WHERE id=? AND tenant_id=?")
        .run(v.name,v.phone||null,v.email||null,v.address||null,v.serviceAddress||null,v.area||null,v.installationDate||null,v.status,v.connection,customer.id,req.user.tenant_id);
      if(v.connection!==customer.connection_status)addConnectionHistory(req.user,customer,"connection_status_changed",customer.connection_status,v.connection);
      if(v.installationDate!==customer.installation_date)addConnectionHistory(req.user,customer,"installation_date_changed",customer.installation_date,v.installationDate);
      audit(req.user,"update","customer",customer.id);
    });
    res.json({success:true,data:getCustomer(customer.id,req.user.tenant_id)});
  });

  app.delete("/api/v1/customers/:id",auth,(req,res)=>{
    const customer=getCustomer(req.params.id,req.user.tenant_id);
    if(!customer)return fail(res,404,"Customer not found.");
    const linked=db.prepare("SELECT (SELECT COUNT(*) FROM subscriptions WHERE tenant_id=? AND customer_id=?)+(SELECT COUNT(*) FROM invoices WHERE tenant_id=? AND customer_id=?)+(SELECT COUNT(*) FROM support_tickets WHERE tenant_id=? AND customer_id=?) count").get(req.user.tenant_id,customer.id,req.user.tenant_id,customer.id,req.user.tenant_id,customer.id).count;
    if(linked)return fail(res,409,"Customer has linked subscriptions, invoices or complaints. Mark the account inactive instead.");
    withTransaction(db,()=>{db.prepare("DELETE FROM customers WHERE id=? AND tenant_id=?").run(customer.id,req.user.tenant_id);audit(req.user,"delete","customer",customer.id);});
    res.json({success:true});
  });

  app.get("/api/v1/subscriptions",auth,(req,res)=>{
    expireDueSubscriptions(req.user);
    const tenant=req.user.tenant_id,status=req.query.status||"",customerId=req.query.customerId||"";
    if(status&&!subscriptionStatuses.has(status))return fail(res,400,"Invalid subscription status filter.");
    const where=["s.tenant_id=?"],params=[tenant];
    if(status){where.push("s.status=?");params.push(status);}
    if(customerId){where.push("s.customer_id=?");params.push(customerId);}
    const data=db.prepare("SELECT s.*,c.full_name customer_name,c.account_number,p.name package_name,p.speed_down_mbps,p.speed_up_mbps,p.monthly_price_pkr FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN packages p ON p.id=s.package_id WHERE "+where.join(" AND ")+" ORDER BY s.created_at DESC").all(...params);
    res.json({success:true,data});
  });

  app.post("/api/v1/subscriptions",auth,(req,res)=>{
    const b=req.body||{},customerId=clean(b.customerId),packageId=clean(b.packageId),status=b.status||"active";
    if(!customerId||!packageId)return fail(res,400,"Customer and package are required.");
    if(!subscriptionStatuses.has(status)||status==="expired")return fail(res,400,"Invalid initial subscription status.");
    const startedAt=b.startedAt||new Date().toISOString().slice(0,10),expiresAt=b.expiresAt||null;
    if(typeof startedAt!=="string"||!validDate(startedAt.slice(0,10))||(expiresAt&&!validDate(expiresAt)))return fail(res,400,"Subscription dates must use YYYY-MM-DD.");
    const customer=getCustomer(customerId,req.user.tenant_id),pack=db.prepare("SELECT * FROM packages WHERE id=? AND tenant_id=? AND status='active'").get(packageId,req.user.tenant_id);
    if(!customer||!pack)return fail(res,404,"Active customer and package in this workspace are required.");
    const subscriptionId=id();
    withTransaction(db,()=>{
      db.prepare("INSERT INTO subscriptions(id,tenant_id,customer_id,package_id,status,started_at,expires_at) VALUES(?,?,?,?,?,?,?)")
        .run(subscriptionId,req.user.tenant_id,customer.id,pack.id,status,status==="pending"?null:startedAt,expiresAt);
      const sub=getSubscription(subscriptionId,req.user.tenant_id);
      addSubHistory(req.user,sub,"created",null,pack.id,"Package: "+pack.name);
      if(status==="active"&&customer.connection_status!=="active"){
        db.prepare("UPDATE customers SET connection_status='active' WHERE id=? AND tenant_id=?").run(customer.id,req.user.tenant_id);
        addConnectionHistory(req.user,customer,"subscription_activated",customer.connection_status,"active");
      }
      audit(req.user,"create","subscription",subscriptionId);
    });
    res.status(201).json({success:true,data:getSubscription(subscriptionId,req.user.tenant_id)});
  });

  app.patch("/api/v1/subscriptions/:id",auth,(req,res)=>{
    const sub=getSubscription(req.params.id,req.user.tenant_id);
    if(!sub)return fail(res,404,"Subscription not found.");
    const b=req.body||{},status=b.status??sub.status,packageId=b.packageId??sub.package_id;
    const startedAt=(b.startedAt??(sub.started_at?String(sub.started_at).slice(0,10):null))||null,expiresAt=(b.expiresAt??sub.expires_at)||null;
    if(!subscriptionStatuses.has(status)|| (startedAt&&!validDate(String(startedAt).slice(0,10))) || (expiresAt&&!validDate(expiresAt)))return fail(res,400,"Invalid subscription status or dates.");
    const pack=db.prepare("SELECT * FROM packages WHERE id=? AND tenant_id=?").get(packageId,req.user.tenant_id);
    if(!pack)return fail(res,404,"Package not found in this workspace.");
    withTransaction(db,()=>{
      db.prepare("UPDATE subscriptions SET package_id=?,status=?,started_at=?,expires_at=? WHERE id=? AND tenant_id=?")
        .run(packageId,status,startedAt,expiresAt,sub.id,req.user.tenant_id);
      if(packageId!==sub.package_id)addSubHistory(req.user,sub,"package_changed",sub.package_id,packageId,"Package changed to "+pack.name);
      if(status!==sub.status)addSubHistory(req.user,sub,status==="suspended"?"suspended":status==="active"?"resumed":"status_changed",sub.status,status);
      if(expiresAt!==sub.expires_at)addSubHistory(req.user,sub,"expiry_changed",sub.expires_at,expiresAt);
      const customer=getCustomer(sub.customer_id,req.user.tenant_id);
      if(status==="suspended"&&customer.connection_status!=="suspended"){
        db.prepare("UPDATE customers SET connection_status='suspended' WHERE id=? AND tenant_id=?").run(customer.id,req.user.tenant_id);
        addConnectionHistory(req.user,customer,"subscription_suspended",customer.connection_status,"suspended");
      } else if(status==="active"&&customer.connection_status!=="active"){
        db.prepare("UPDATE customers SET connection_status='active' WHERE id=? AND tenant_id=?").run(customer.id,req.user.tenant_id);
        addConnectionHistory(req.user,customer,"subscription_resumed",customer.connection_status,"active");
      } else if(status==="cancelled"){
        db.prepare("UPDATE customers SET connection_status='disconnected' WHERE id=? AND tenant_id=?").run(customer.id,req.user.tenant_id);
        addConnectionHistory(req.user,customer,"subscription_cancelled",customer.connection_status,"disconnected");
      }
      audit(req.user,"update","subscription",sub.id);
    });
    res.json({success:true,data:getSubscription(sub.id,req.user.tenant_id)});
  });

  app.post("/api/v1/subscriptions/:id/renew",auth,(req,res)=>{
    const sub=getSubscription(req.params.id,req.user.tenant_id);
    if(!sub)return fail(res,404,"Subscription not found.");
    const days=Number(req.body?.days??30);
    if(!Number.isInteger(days)||days<1||days>366)return fail(res,400,"Renewal days must be between 1 and 366.");
    const today=new Date().toISOString().slice(0,10);
    const base=sub.expires_at&&sub.expires_at>today?sub.expires_at:today;
    const date=new Date(base+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);
    const expiresAt=date.toISOString().slice(0,10);
    withTransaction(db,()=>{
      db.prepare("UPDATE subscriptions SET status='active',started_at=COALESCE(started_at,?),expires_at=?,renewed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?")
        .run(today,expiresAt,sub.id,req.user.tenant_id);
      addSubHistory(req.user,sub,"renewed",sub.expires_at,expiresAt,days+" day renewal");
      const customer=getCustomer(sub.customer_id,req.user.tenant_id);
      if(customer.connection_status!=="active"){
        db.prepare("UPDATE customers SET connection_status='active' WHERE id=? AND tenant_id=?").run(customer.id,req.user.tenant_id);
        addConnectionHistory(req.user,customer,"subscription_renewed",customer.connection_status,"active");
      }
      audit(req.user,"renew","subscription",sub.id);
    });
    res.json({success:true,data:getSubscription(sub.id,req.user.tenant_id)});
  });
}
