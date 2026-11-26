import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/d1-api-worker.js", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../assets/js/app.js", import.meta.url), "utf8");

test("hosted D1 exposes the tenant compatibility routes used by company settings", () => {
  assert.ok(source.includes("if(path==='/api/tenant'&&m==='GET')return await getTenantCompat"));
  assert.ok(source.includes("if(path==='/api/tenant'&&m==='PUT')return await updateTenantCompat"));
  assert.ok(source.includes("async function getTenantCompat"));
  assert.ok(source.includes("async function updateTenantCompat"));
  assert.ok(dashboard.includes('call("/api/v1/tenant")'));
  assert.ok(dashboard.includes('call("/api/v1/tenant",{method:"PATCH"'));
});

test("tenant settings remain behind the authenticated organization API gate", () => {
  const authGate = source.indexOf("const auth=await getAuth(request,env)");
  const route = source.indexOf("if(path==='/api/tenant'&&m==='GET')");
  assert.ok(authGate >= 0 && route > authGate);
  assert.ok(source.includes("const{orgId,userId}=auth"));
});

test("tenant compatibility maps support phone and brand colour into tenant-scoped settings", () => {
  assert.ok(source.includes("key,value FROM settings WHERE organization_id=? AND key IN ('support_phone','brand_color')"));
  assert.ok(source.includes("settings.push(['support_phone'"));
  assert.ok(source.includes("settings.push(['brand_color'"));
  assert.ok(source.includes("ON CONFLICT(organization_id,key) DO UPDATE SET value=excluded.value"));
  assert.ok(source.includes("Brand colour must look like #16a34a"));
  assert.ok(source.includes("update_tenant_settings"));
});

test("tenant adapter returns only fields supported by the current D1 organization schema", () => {
  assert.ok(source.includes("SELECT id,name,slug,plan,created_at,address,phone FROM organizations WHERE id=?"));
  assert.ok(source.includes("brand_color:values.brand_color||'#16a34a'"));
  assert.ok(source.includes("support_phone:values.support_phone??org.phone??''"));
  assert.ok(!source.includes("SELECT id,name,slug,status,plan,customer_limit,brand_color"));
});
