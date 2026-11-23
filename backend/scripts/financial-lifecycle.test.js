import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";

const dir=mkdtempSync(join(tmpdir(),"nexus-financial-lifecycle-"));
process.env.SQLITE_PATH=join(dir,"test.sqlite");
process.env.CORS_ORIGINS="http://localhost";
const {default:app}=await import("../src/app.js");
const {db}=await import("../src/config/database.js");
const server=app.listen(0);
await once(server,"listening");
const base="http://127.0.0.1:"+server.address().port;
const request=async(path,method="GET",body,token)=>{
 const headers={"Content-Type":"application/json"};
 if(token)headers.Authorization="Bearer "+token;
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
};
try{
 const setup=await request("/api/v1/setup","POST",{companyName:"Financial Lifecycle Test ISP",fullName:"Test Owner",email:"owner@financial-lifecycle.test",password:"Strong-Test-Password-123"});
 assert.equal(setup.status,201);
 const token=setup.data.token;
 const customer=await request("/api/v1/customers","POST",{fullName:"Payment Allocation Test Customer"},token);
 assert.equal(customer.status,201);
 const customerId=customer.data.data.id;
 const invoice=await request("/api/v1/invoices","POST",{customerId,amountPkr:1500,billingPeriod:"2026-11"},token);
 assert.equal(invoice.status,201);
 const unallocated=await request("/api/v1/unallocated-payments","POST",{customerId,amountPkr:1000,method:"cash",reference:"CASH-TEST-001"},token);
 assert.equal(unallocated.status,201);
 const allocation=await request("/api/v1/unallocated-payments/"+unallocated.data.data.id+"/allocate","POST",{invoiceId:invoice.data.data.id},token);
 assert.equal(allocation.status,201);
 assert.equal(allocation.data.data.amount_pkr,1000);
 const repeated=await request("/api/v1/unallocated-payments/"+unallocated.data.data.id+"/allocate","POST",{invoiceId:invoice.data.data.id},token);
 assert.equal(repeated.status,409);
 const payments=db.prepare("SELECT COUNT(*) n FROM payments WHERE tenant_id=? AND invoice_id=?").get(unallocated.data.data.tenant_id,invoice.data.data.id);
 assert.equal(payments.n,1);
 const stored=db.prepare("SELECT status,allocated_invoice_id FROM unallocated_payments WHERE id=?").get(unallocated.data.data.id);
 assert.equal(stored.status,"allocated");
 assert.equal(stored.allocated_invoice_id,invoice.data.data.id);
 console.log("NEXUS financial lifecycle tests passed: atomic allocation, duplicate allocation rejection and single payment ledger entry.");
}finally{
 await new Promise(resolve=>server.close(resolve));
 db.close();
 rmSync(dir,{recursive:true,force:true});
}
