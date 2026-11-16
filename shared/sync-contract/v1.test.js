import test from "node:test";
import assert from "node:assert/strict";
import {createOperation,mapLocalRecord,validateOperation} from "./v1.js";

const org="org-prod-1";
test("customer mapping splits names and maps tenant to authenticated organization",()=>{
 const mapped=mapLocalRecord("customer",{id:"c1",tenant_id:"local-t1",customer_code:"GF-1",full_name:"Ayesha Noor",phone:"0300",status:"active"},org);
 assert.equal(mapped.organization_id,org);assert.equal(mapped.first_name,"Ayesha");assert.equal(mapped.last_name,"Noor");assert.equal(mapped.customer_code,"GF-1");
});
test("package mapping preserves integer PKR and independent upload/download speeds",()=>{
 const mapped=mapLocalRecord("package",{id:"p1",name:"20M",speed_down_mbps:20,speed_up_mbps:10,monthly_price_pkr:2500,status:"active"},org);
 assert.equal(mapped.speed_down,20);assert.equal(mapped.speed_up,10);assert.equal(mapped.price,2500);assert.equal(mapped.billing_cycle,"monthly");
});
test("invoice and payment mapping are integer-safe and append-oriented",()=>{
 const inv=mapLocalRecord("invoice",{id:"i1",customer_id:"c1",invoice_number:"INV-1",amount_pkr:2500,status:"unpaid"},org);
 const pay=mapLocalRecord("payment",{id:"pay1",invoice_id:"i1",customer_id:"c1",amount_pkr:500,method:"cash"},org);
 assert.equal(inv.total,2500);assert.equal(inv.tax,0);assert.equal(pay.amount,500);assert.equal(pay.status,"completed");
 assert.throws(()=>mapLocalRecord("payment",{id:"pay2",invoice_id:"i1",customer_id:"c1",amount_pkr:0,method:"cash"},org),/safe integer/);
});
test("subscription mapping keeps relationships explicit",()=>{
 const x=mapLocalRecord("subscription",{id:"s1",customer_id:"c1",package_id:"p1",status:"active",started_at:"2026-11-01"},org);
 assert.equal(x.customer_id,"c1");assert.equal(x.package_id,"p1");
});
test("contract rejects secrets, unknown entity, wrong version and malformed payload",()=>{
 const base={contractVersion:1,operationId:"op1",tenantId:"local1",entity:"customer",entityId:"c1",operation:"upsert",payload:{id:"c1",organization_id:org}};
 assert.throws(()=>validateOperation({...base,payload:{password_hash:"x"}}),/Sensitive field/);
 assert.throws(()=>validateOperation({...base,entity:"router"}),/not syncable/);
 assert.throws(()=>validateOperation({...base,contractVersion:2}),/unsupported/);
 assert.throws(()=>validateOperation({...base,payload:[]}),/object/);
});
test("replayed operation IDs are idempotent and payload reuse is rejected",()=>{
 const ledger=new Map();
 const apply=(op)=>{const prior=ledger.get(op.operationId);const fingerprint=JSON.stringify(op);if(prior){if(prior!==fingerprint)throw new Error("IDEMPOTENCY_KEY_REUSED");return {duplicate:true};}ledger.set(op.operationId,fingerprint);return {duplicate:false};};
 const op=createOperation({operationId:"op-1",tenantId:"local-t1",entity:"customer",record:{id:"c1",tenant_id:"local-t1",customer_code:"C1",full_name:"Test Customer"},organizationId:org});
 assert.deepEqual(apply(op),{duplicate:false});assert.deepEqual(apply(op),{duplicate:true});
 const changed={...op,payload:{...op.payload,first_name:"Changed"}};
 assert.throws(()=>apply(changed),/IDEMPOTENCY_KEY_REUSED/);
});
test("client tenant ID never becomes the production organization ID",()=>{
 const mapped=mapLocalRecord("customer",{id:"c1",tenant_id:"local-tenant",customer_code:"C1",full_name:"Test"},org);
 assert.notEqual(mapped.organization_id,"local-tenant");assert.equal(mapped.organization_id,org);
});

test("operation envelope binds payload identity to the operation and requires organization scope",()=>{
 const base={contractVersion:1,operationId:"op-identity",tenantId:"local-t1",entity:"customer",entityId:"c1",operation:"upsert",payload:{id:"c1",organization_id:org}};
 assert.throws(()=>validateOperation({...base,payload:{...base.payload,id:"c2"}}),/payload.id must match entityId/);
 assert.throws(()=>validateOperation({...base,payload:{id:"c1"}}),/organization_id/);
});
test("createOperation rejects a record from a different local tenant",()=>{
 assert.throws(()=>createOperation({operationId:"op-cross-tenant",tenantId:"local-t1",entity:"customer",record:{id:"c1",tenant_id:"local-t2",customer_code:"C1",full_name:"Test"},organizationId:org}),/tenant_id must match tenantId/);
});
test("validated payload is copied and frozen against later caller mutation",()=>{
 const payload={id:"c1",organization_id:org,profile:{name:"A"}};
 const op=validateOperation({contractVersion:1,operationId:"op-copy",tenantId:"local-t1",entity:"customer",entityId:"c1",operation:"upsert",payload});
 payload.profile.name="Changed";
 assert.equal(op.payload.profile.name,"A");
 assert.equal(Object.isFrozen(op.payload),true);
});
test("non-JSON values and non-finite numbers are rejected",()=>{
 const base={contractVersion:1,operationId:"op-json",tenantId:"local-t1",entity:"customer",entityId:"c1",operation:"upsert",payload:{id:"c1",organization_id:org}};
 assert.throws(()=>validateOperation({...base,payload:{...base.payload,score:Infinity}}),/Non-finite number/);
 assert.throws(()=>validateOperation({...base,payload:{...base.payload,fn:()=>true}}),/Non-JSON value/);
});
