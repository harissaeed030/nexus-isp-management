import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";

const dir=mkdtempSync(join(tmpdir(),"nexus-inventory-concurrency-"));
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
 const setup=await request("/api/v1/setup","POST",{companyName:"Inventory Concurrency Test ISP",fullName:"Test Owner",email:"owner@inventory-concurrency.test",password:"Strong-Test-Password-123"});
 assert.equal(setup.status,201);
 const token=setup.data.token;
 const created=await request("/api/v1/operations/inventory","POST",{name:"ONU Stock",category:"onu",quantity:10,reorderLevel:2},token);
 assert.equal(created.status,201);
 const itemId=created.data.data.id;
 const path="/api/v1/operations/inventory/"+itemId+"/movements";
 const attempts=await Promise.all([
  request(path,"POST",{quantity:8,movementType:"stock_out"},token),
  request(path,"POST",{quantity:8,movementType:"stock_out"},token)
 ]);
 assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);
 const item=db.prepare("SELECT quantity,status FROM inventory_items WHERE id=?").get(itemId);
 assert.equal(item.quantity,2);
 assert.equal(item.status,"low_stock");
 const movements=db.prepare("SELECT COALESCE(SUM(quantity),0) total,COUNT(*) count FROM inventory_movements WHERE item_id=?").get(itemId);
 assert.equal(movements.total,2);
 assert.equal(movements.count,2);
 console.log("NEXUS inventory concurrency tests passed: concurrent stock issues cannot overspend stock or desynchronize the movement ledger.");
}finally{
 await new Promise(resolve=>server.close(resolve));
 db.close();
 rmSync(dir,{recursive:true,force:true});
}
