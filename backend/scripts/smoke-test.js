import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID, scryptSync, createHash } from "node:crypto";

const dir=mkdtempSync(join(tmpdir(),"nexus-smoke-"));
process.env.SQLITE_PATH=join(dir,"test.sqlite");
process.env.CORS_ORIGINS="http://localhost";
const {default:app}=await import("../src/app.js");
const {db}=await import("../src/config/database.js");
const server=app.listen(0);
await once(server,"listening");
const address=server.address();
const base="http://127.0.0.1:"+address.port;
const request=async(path,method="GET",body,token)=>{
 const headers={"Content-Type":"application/json"};
 if(token)headers.Authorization="Bearer "+token;
 const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 return {status:response.status,data};
};
try{
 const setup=await request("/api/v1/setup","POST",{companyName:"Nexus Test ISP",fullName:"Test Owner",email:"owner@nexus.test",password:"Strong-Test-Password-123"});
 assert.equal(setup.status,201);
 const token=setup.data.token;
 const customer=await request("/api/v1/customers","POST",{fullName:"Test Subscriber"},token);
 assert.equal(customer.status,201);
 const customerCsv=await fetch(base+"/api/v1/exports/customers.csv",{headers:{Authorization:"Bearer "+token}});
 assert.equal(customerCsv.status,200);
 assert.ok(customerCsv.headers.get("content-type").includes("text/csv"));
 assert.match(await customerCsv.text(),/Test Subscriber/);
 const pack=await request("/api/v1/packages","POST",{name:"Test 10M",speedDownMbps:10,speedUpMbps:10,monthlyPricePkr:1500},token);
 assert.equal(pack.status,201);
 const sub=await request("/api/v1/subscriptions","POST",{customerId:customer.data.data.id,packageId:pack.data.data.id,status:"active"},token);
 assert.equal(sub.status,201);
 const router=await request("/api/v1/routers","POST",{name:"Core Router",host:"192.0.2.1",apiPort:8728},token);
 assert.equal(router.status,201);
 const billing=await request("/api/v1/billing/generate","POST",{period:"2026-11"},token);
 assert.equal(billing.status,201);
 assert.equal(billing.data.invoicesCreated,1);
 const duplicate=await request("/api/v1/billing/generate","POST",{period:"2026-11"},token);
 assert.equal(duplicate.status,409);
 const invoiceList=await request("/api/v1/invoices","GET",undefined,token);
 assert.equal(invoiceList.status,200);
 const invoiceId=invoiceList.data.data[0].id;
 const partialPayment=await request("/api/v1/payments","POST",{invoiceId,amountPkr:500,method:"cash"},token);
 assert.equal(partialPayment.status,201);
 const rejectedOverpayment=await request("/api/v1/payments","POST",{invoiceId,amountPkr:1001,method:"cash"},token);
 assert.equal(rejectedOverpayment.status,400);
 const finalPayment=await request("/api/v1/payments","POST",{invoiceId,amountPkr:1000,method:"cash"},token);
 assert.equal(finalPayment.status,201);
 const paidInvoice=(await request("/api/v1/invoices","GET",undefined,token)).data.data[0];
 assert.equal(paidInvoice.status,"paid");
 const staff=await request("/api/v1/staff","POST",{fullName:"Billing Staff",email:"billing@nexus.test",password:"Billing-Password-123",role:"billing"},token);
 assert.equal(staff.status,201);
 const staffLogin=await request("/api/v1/auth/login","POST",{email:"billing@nexus.test",password:"Billing-Password-123"});
 assert.equal(staffLogin.status,200);
 const billingToken=staffLogin.data.token;
 assert.equal((await request("/api/v1/staff","GET",undefined,billingToken)).status,403);
 assert.equal((await request("/api/v1/customers","POST",{fullName:"Denied Subscriber"},billingToken)).status,403);
 const permissionState=await request("/api/v1/staff/"+staff.data.data.id+"/permissions","GET",undefined,token);
 assert.equal(permissionState.status,200);
 assert.equal(permissionState.data.data.permissions.find(x=>x.key==="customers.create").allowed,false);
 const granted=await request("/api/v1/staff/"+staff.data.data.id+"/permissions","PUT",{allowedPermissions:["dashboard.read","customers.read","customers.create","packages.read","subscriptions.read","billing.read","invoices.create","payments.create","billing.generate","reports.read"]},token);
 assert.equal(granted.status,200);
 const allowedCustomer=await request("/api/v1/customers","POST",{fullName:"Permission Test Subscriber"},billingToken);
 assert.equal(allowedCustomer.status,201);
 const revoked=await request("/api/v1/staff/"+staff.data.data.id+"/permissions","PUT",{allowedPermissions:["dashboard.read","customers.read","packages.read","subscriptions.read","billing.read","invoices.create","payments.create","billing.generate","reports.read"]},token);
 assert.equal(revoked.status,200);
 assert.equal((await request("/api/v1/customers","POST",{fullName:"Revoked Subscriber"},billingToken)).status,403);
 assert.equal((await request("/api/v1/routers","GET",undefined,billingToken)).status,403);
 const deniedRouterExport=await fetch(base+"/api/v1/exports/routers.csv",{headers:{Authorization:"Bearer "+billingToken}});
 assert.equal(deniedRouterExport.status,403);
 const allowedInvoiceExport=await fetch(base+"/api/v1/exports/invoices.csv",{headers:{Authorization:"Bearer "+billingToken}});
 assert.equal(allowedInvoiceExport.status,200);
 assert.ok(allowedInvoiceExport.headers.get("content-type").includes("text/csv"));
 const technician=await request("/api/v1/staff","POST",{fullName:"Field Technician",email:"tech@nexus.test",password:"Technician-Password-123",role:"technician"},token);
 assert.equal(technician.status,201);
 const techLogin=await request("/api/v1/auth/login","POST",{email:"tech@nexus.test",password:"Technician-Password-123"});
 assert.equal(techLogin.status,200);
 assert.equal((await request("/api/v1/routers","GET",undefined,techLogin.data.token)).status,200);
 assert.equal((await request("/api/v1/routers","POST",{name:"Blocked Router",host:"192.0.2.2"},techLogin.data.token)).status,403);
 const reports=await request("/api/v1/reports/summary","GET",undefined,token);
 assert.equal(reports.status,200);

 // Administrator cannot create/promote another administrator or alter the owner.
 const admin=await request("/api/v1/staff","POST",{fullName:"Workspace Admin",email:"admin@nexus.test",password:"Admin-Password-123",role:"admin"},token);
 assert.equal(admin.status,201);
 const adminLogin=await request("/api/v1/auth/login","POST",{email:"admin@nexus.test",password:"Admin-Password-123"});
 assert.equal(adminLogin.status,200);
 assert.equal((await request("/api/v1/staff","POST",{fullName:"Escalated Admin",email:"escalated@nexus.test",password:"Escalated-Password-123",role:"admin"},adminLogin.data.token)).status,403);
 assert.equal((await request("/api/v1/staff/"+staff.data.data.id,"PATCH",{role:"admin"},adminLogin.data.token)).status,403);
 assert.equal((await request("/api/v1/staff/"+setup.data.user.id,"PATCH",{status:"inactive"},token)).status,403);

 // Create a second tenant independently and verify cross-tenant record isolation.
 const tenantId=randomUUID(),tenantUserId=randomUUID(),salt=randomBytes(16).toString("hex");
 const passwordHash=salt+":"+scryptSync("Tenant-Two-Password-123",salt,64).toString("hex");
 db.prepare("INSERT INTO tenants(id,name,slug) VALUES(?,?,?)").run(tenantId,"Second ISP","second-isp-"+tenantId.slice(0,6));
 db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,full_name,role) VALUES(?,?,?,?,?,'owner')").run(tenantUserId,tenantId,"owner@second.test",passwordHash,"Second Owner");
 const tenantLogin=await request("/api/v1/auth/login","POST",{email:"owner@second.test",password:"Tenant-Two-Password-123"});
 assert.equal(tenantLogin.status,200);
 const secondCustomer=await request("/api/v1/customers","POST",{fullName:"Private Second ISP Customer"},tenantLogin.data.token);
 assert.equal(secondCustomer.status,201);
 const secondCustomerId=secondCustomer.data.data.id;
 assert.equal((await request("/api/v1/customers/"+secondCustomerId,"GET",undefined,token)).status,404);
 assert.equal((await request("/api/v1/customers/"+secondCustomerId,"PATCH",{fullName:"Cross Tenant Edit"},token)).status,404);
 assert.equal((await request("/api/v1/customers/"+secondCustomerId,"DELETE",undefined,token)).status,404);
 const firstTenantRows=await request("/api/v1/customers","GET",undefined,token);
 assert.ok(!firstTenantRows.data.data.some(row=>row.id===secondCustomerId));
 const firstTenantCsv=await fetch(base+"/api/v1/exports/customers.csv",{headers:{Authorization:"Bearer "+token}});
 assert.ok(!(await firstTenantCsv.text()).includes("Private Second ISP Customer"));
 const secondTenantRows=await request("/api/v1/customers","GET",undefined,tenantLogin.data.token);
 assert.ok(!secondTenantRows.data.data.some(row=>row.full_name==="Test Subscriber"));

 // Deactivation revokes existing sessions; expired sessions are rejected.
 assert.equal((await request("/api/v1/staff/"+staff.data.data.id,"PATCH",{status:"inactive"},token)).status,200);
 assert.equal((await request("/api/v1/customers","GET",undefined,billingToken)).status,401);
 const techHash=createHash("sha256").update(techLogin.data.token).digest("hex");
 db.prepare("UPDATE sessions SET expires_at=? WHERE token_hash=?").run(new Date(Date.now()-1000).toISOString(),techHash);
 assert.equal((await request("/api/v1/routers","GET",undefined,techLogin.data.token)).status,401);

 // Dedicated login limiter allows five failed attempts and blocks the sixth.
 for(let i=0;i<5;i++) assert.equal((await request("/api/v1/auth/login","POST",{email:"nobody@nexus.test",password:"Wrong-Password-123"})).status,401);
 assert.equal((await request("/api/v1/auth/login","POST",{email:"nobody@nexus.test",password:"Wrong-Password-123"})).status,429);
 console.log("Nexus security tests passed: tenant isolation, RBAC escalation guards, permission grants/revokes, session expiry/revocation, login rate limit, exports and billing.");
}finally{
 await new Promise(resolve=>server.close(resolve));
 rmSync(dir,{recursive:true,force:true});
}
