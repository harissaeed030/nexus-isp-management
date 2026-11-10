import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";

const dir=mkdtempSync(join(tmpdir(),"nexus-smoke-"));
process.env.SQLITE_PATH=join(dir,"test.sqlite");
process.env.CORS_ORIGINS="http://localhost";
const {default:app}=await import("../src/app.js");
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
 const staff=await request("/api/v1/staff","POST",{fullName:"Billing Staff",email:"billing@nexus.test",password:"Billing-Password-123",role:"billing"},token);
 assert.equal(staff.status,201);
 const staffLogin=await request("/api/v1/auth/login","POST",{email:"billing@nexus.test",password:"Billing-Password-123"});
 assert.equal(staffLogin.status,200);
 const denied=await request("/api/v1/routers","GET",undefined,staffLogin.data.token);
 assert.equal(denied.status,403);
 const reports=await request("/api/v1/reports/summary","GET",undefined,token);
 assert.equal(reports.status,200);
 console.log("Nexus smoke tests passed: setup, customers, packages, subscriptions, routers, monthly billing, duplicate protection, staff and reports.");
}finally{
 await new Promise(resolve=>server.close(resolve));
 rmSync(dir,{recursive:true,force:true});
}
