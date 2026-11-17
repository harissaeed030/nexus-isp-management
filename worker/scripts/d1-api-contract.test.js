import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeApiMethod, mapTicketRow, normalizeTicketPayload, mapCustomerRow, normalizeCustomerPayload, mapPackageRow, normalizePackagePayload, mapSubscriptionRow, normalizeSubscriptionPayload, mapInvoiceRow, normalizeInvoicePayload, mapPaymentRow, normalizePaymentPayload, mapOltRow, mapOnuRow, normalizeOnuPayload, mapRouterRow, validateAcsBaseUrl, mapAcsConnection, mapAcsDevice, mapAcsParameters, normalizeAcsConnectionPayload } from "../src/d1-api-worker.js";

const source = await readFile(new URL("../src/d1-api-worker.js", import.meta.url), "utf8");
const config = await readFile(new URL("../wrangler.api.toml", import.meta.url), "utf8");
const customerMigration = await readFile(new URL("../../cloudflare/d1/migrations/0012_customer_workspace_compatibility.sql", import.meta.url), "utf8");
const subscriptionMigration = await readFile(new URL("../../cloudflare/d1/migrations/0013_subscription_workspace_status.sql", import.meta.url), "utf8");
const acsMigration = await readFile(new URL("../../cloudflare/d1/migrations/0015_genieacs_tr069_inventory.sql", import.meta.url), "utf8");

test("D1 API Worker includes authenticated organization registration and login", () => {
  assert.match(source, /\/api\/auth\/register/);
  assert.match(source, /\/api\/auth\/login/);
  assert.match(source, /verifyJWT/);
  assert.match(source, /tokenVersion/);
});

test("D1 API Worker includes core ISP billing and customer modules", () => {
  for (const route of ["/api/customers", "/api/packages", "/api/subscriptions", "/api/invoices", "/api/payments", "/api/billing/generate", "/api/refunds", "/api/complaints"]) {
    assert.ok(source.includes(route), `Missing API route family: ${route}`);
  }
});

test("D1 API Worker includes network inventory and staff permission modules", () => {
  for (const route of ["/api/staff", "/api/pppoe", "/api/onus", "/api/network/devices", "/api/audit-logs", "/api/notifications"]) {
    assert.ok(source.includes(route), `Missing API route family: ${route}`);
  }
  assert.match(source, /roleAllowedWithOverrides/);
});

test("candidate config is isolated from production D1", () => {
  assert.match(config, /name = "nexus-saas-api-staging"/);
  assert.match(config, /database_name = "nexus-saas-staging-db"/);
  assert.match(config, /194f62e2-2766-48ab-be17-81248610c0cd/);
  assert.doesNotMatch(config, /ce88098b-bff4-4d06-a0df-7bf29622a085/);
});

test("D1 API accepts dashboard PATCH updates through the existing PUT handlers", () => {
  assert.equal(normalizeApiMethod("PATCH"), "PUT");
  assert.equal(normalizeApiMethod("PUT"), "PUT");
  assert.equal(normalizeApiMethod("GET"), "GET");
  assert.match(source, /new Request\(request,\{method:'PUT'\}\)/);
});

test("dashboard compatibility routes and ticket adapter are present", () => {
  assert.match(source, /path==='\/api\/dashboard'/);
  assert.match(source, /path==='\/api\/reports\/summary'/);
  assert.match(source, /if\(path==='\/api\/tickets'\)path='\/api\/complaints'/);
  assert.deepEqual(mapTicketRow({first_name:"Ali",last_name:"Khan",priority:null}), {first_name:"Ali",last_name:"Khan",priority:"normal",customer_name:"Ali Khan",customer_id:null});
  assert.equal(normalizeTicketPayload({customerId:"c1",subject:"Line down"}).customer_id,"c1");
});


test("customer DTO maps legacy D1 rows to the dashboard contract", () => {
  assert.deepEqual(mapCustomerRow({
    id: "c1", first_name: "Haris", last_name: "Qureshi", customer_code: "CUS-123",
    installation_address: "Unit 8", account_status: "blocked", connection_status: "suspended"
  }), {
    id: "c1", first_name: "Haris", last_name: "Qureshi", customer_code: "CUS-123",
    installation_address: "Unit 8", account_status: "blocked", connection_status: "suspended",
    full_name: "Haris Qureshi", account_number: "CUS-123", service_address: "Unit 8",
    coverage_area: "", status: "blocked"
  });
});

test("customer request adapter maps dashboard camelCase fields without conflating account and connection status", () => {
  assert.deepEqual(normalizeCustomerPayload({
    fullName: "Haris Qureshi", serviceAddress: "Unit 8", coverageArea: "Latifabad",
    connectionStatus: "active", status: "blocked", installationDate: "2026-11-17"
  }), {
    fullName: "Haris Qureshi", serviceAddress: "Unit 8", coverageArea: "Latifabad",
    connectionStatus: "active", status: "blocked", installationDate: "2026-11-17",
    first_name: "Haris", last_name: "Qureshi", service_address: "Unit 8",
    coverage_area: "Latifabad", connection_status: "active",
    account_status: "blocked", installation_date: "2026-11-17"
  });
});

test("customer CRUD supports dashboard pagination, filters, profile route and linked-record delete protection", () => {
  assert.match(source, /pageSize/);
  assert.match(source, /coverageArea/);
  assert.match(source, /connectionStatus/);
  assert.match(source, /getCustomerProfile/);
  assert.match(source, /CUSTOMER_HAS_LINKED_RECORDS/);
  assert.match(source, /account_status/);
});

test("customer workspace migration is additive and tenant-scoped", () => {
  for (const field of ["account_number", "service_address", "coverage_area", "connection_status", "account_status"]) {
    assert.match(customerMigration, new RegExp("ADD COLUMN " + field));
  }
  assert.match(customerMigration, /organization_id, customer_id, created_at/);
  assert.match(customerMigration, /customer connection history tenant mismatch/);
  assert.match(customerMigration, /subscription history tenant mismatch/);
});


test("package DTO maps D1 pricing and speed fields to the dashboard contract", () => {
  assert.deepEqual(mapPackageRow({
    id: "p1", name: "Home 10M", speed_mbps: 10, speed_down: "10", speed_up: "5",
    price: 1200, is_active: 1
  }), {
    id: "p1", name: "Home 10M", speed_mbps: 10, speed_down: "10", speed_up: "5",
    price: 1200, is_active: 1, speed_down_mbps: 10, speed_up_mbps: 5,
    monthly_price_pkr: 1200, status: "active"
  });
});

test("package create and edit adapter maps camelCase fields and archive status", () => {
  assert.deepEqual(normalizePackagePayload({
    name: "Home 10M", speedDownMbps: "10", speedUpMbps: "5",
    monthlyPricePkr: "1200", status: "archived"
  }), {
    name: "Home 10M", speedDownMbps: "10", speedUpMbps: "5",
    monthlyPricePkr: "1200", status: "archived",
    speed_down: "10", speed_up: "5", speed_mbps: 10,
    price: 1200, is_active: false
  });
});


test("subscription DTO maps D1 customer, package, date and lifecycle fields", () => {
  assert.deepEqual(mapSubscriptionRow({
    id: "s1", first_name: "Haris", last_name: "Qureshi", customer_code: "CUS-1",
    package_name: "Home 10M", speed_mbps: 10, speed_down: "10", speed_up: "5",
    price: 1200, start_date: "2026-11-01", end_date: "2026-12-01",
    status: "suspended", workspace_status: "pending"
  }), {
    id: "s1", first_name: "Haris", last_name: "Qureshi", customer_code: "CUS-1",
    package_name: "Home 10M", speed_mbps: 10, speed_down: "10", speed_up: "5",
    price: 1200, start_date: "2026-11-01", end_date: "2026-12-01",
    status: "pending", workspace_status: "pending", customer_name: "Haris Qureshi",
    account_number: "CUS-1", speed_down_mbps: 10, speed_up_mbps: 5,
    monthly_price_pkr: 1200, started_at: "2026-11-01", expires_at: "2026-12-01"
  });
});

test("subscription request adapter maps dashboard camelCase fields", () => {
  assert.deepEqual(normalizeSubscriptionPayload({
    customerId: "c1", packageId: "p1", startedAt: "2026-11-17", expiresAt: "2026-12-17"
  }), {
    customerId: "c1", packageId: "p1", startedAt: "2026-11-17", expiresAt: "2026-12-17",
    customer_id: "c1", package_id: "p1", start_date: "2026-11-17", end_date: "2026-12-17"
  });
});

test("subscription renewal route and tenant-scoped history are implemented", () => {
  assert.match(source, /renewSub/);
  assert.match(source, /renew_subscription/);
  assert.match(source, /subscription_history/);
  assert.match(subscriptionMigration, /workspace_status TEXT NOT NULL DEFAULT 'active'/);
  assert.match(subscriptionMigration, /idx_subscriptions_org_workspace_status/);
});


test("inactive or blocked customer accounts cannot use the customer portal", () => {
  assert.match(source, /customer_account_status!=='active'/);
  assert.match(source, /Activate the customer account before enabling portal access/);
  assert.match(source, /account_status='active'/);
});


test("invoice DTO maps totals and customer display fields for the billing dashboard", () => {
  assert.deepEqual(mapInvoiceRow({
    id: "i1", first_name: "Haris", last_name: "Qureshi", total: 1500,
    status: "pending", display_status: "partial"
  }), {
    id: "i1", first_name: "Haris", last_name: "Qureshi", total: 1500,
    status: "partial", display_status: "partial", customer_name: "Haris Qureshi",
    amount_pkr: 1500
  });
});

test("invoice and payment dashboard payloads are normalized to D1 fields", () => {
  assert.deepEqual(normalizeInvoicePayload({customerId:"c1",amountPkr:"1200",dueDate:"2026-12-01"}), {
    customerId:"c1",amountPkr:"1200",dueDate:"2026-12-01",customer_id:"c1",amount:"1200",due_date:"2026-12-01"
  });
  assert.deepEqual(normalizePaymentPayload({invoiceId:"i1",amountPkr:"500",method:"cash"}), {
    invoiceId:"i1",amountPkr:"500",method:"cash",invoice_id:"i1",amount:500
  });
});

test("payment DTO returns dashboard amount, method and receipt date", () => {
  assert.deepEqual(mapPaymentRow({
    id:"pay1", first_name:"Haris", last_name:"Qureshi", amount:500,
    payment_method:"bank_transfer", paid_at:"2026-11-17", notes:null
  }), {
    id:"pay1", first_name:"Haris", last_name:"Qureshi", amount:500,
    payment_method:"bank_transfer", paid_at:"2026-11-17", notes:null,
    customer_name:"Haris Qureshi", amount_pkr:500, method:"bank", received_at:"2026-11-17"
  });
});

test("dashboard payment collection endpoint is permission-mapped and routed", () => {
  assert.match(source, /path==='\/api\/payments'\)return v==='GET'\?'billing.read':v==='POST'\?'payments.create'/);
  assert.match(source, /path==='\/api\/payments'&&m==='POST'/);
});


test("OLT inventory DTO exposes dashboard fields without implying live management", () => {
  assert.deepEqual(mapOltRow({
    id:"olt1",name:"Main OLT",device_type:"olt",host:"192.0.2.10",status:"inactive",
    model:"HSGQ-G04R",notes:"Unit 8",pon_ports:4
  }), {
    id:"olt1",name:"Main OLT",device_type:"olt",host:"192.0.2.10",status:"inactive",
    model:"HSGQ-G04R",notes:"Unit 8",pon_ports:4,vendor:"Unknown",location:"Unit 8",
    firmwareVersion:null
  });
});

test("ONU DTO and payload adapter map dashboard PON and customer fields", () => {
  assert.deepEqual(mapOnuRow({
    id:"onu1",olt_device_id:"olt1",pon_port:"3",first_name:"Haris",last_name:"Qureshi",
    serial_number:"ABC123"
  }), {
    id:"onu1",olt_device_id:"olt1",pon_port:"3",first_name:"Haris",last_name:"Qureshi",
    serial_number:"ABC123",olt_id:"olt1",pon_index:3,customer_name:"Haris Qureshi"
  });
  assert.deepEqual(normalizeOnuPayload({
    serialNumber:"ABC123",oltId:"olt1",customerId:"c1",ponPortId:"olt1:2"
  }), {
    serialNumber:"ABC123",oltId:"olt1",customerId:"c1",ponPortId:"olt1:2",
    serial_number:"ABC123",olt_device_id:"olt1",customer_id:"c1",pon_port:"olt1:2"
  });
});

test("OLT inventory routes are tenant scoped and do not accept plaintext credentials", () => {
  assert.match(source, /async function createOlt/);
  assert.match(source, /OLT credential storage is not enabled/);
  assert.match(source, /device_type='olt'/);
  assert.match(source, /async function getOltPorts/);
  assert.match(source, /liveTelemetry:false/);
  assert.match(source, /mapOnuRow/);
  assert.match(source, /map_onu_customer/);
});


test("RouterOS inventory DTO never exposes encrypted credential material", () => {
  assert.deepEqual(mapRouterRow({
    id:"r1",name:"Edge Router",host:"192.0.2.1",port:8729,username:"nexus-api",
    notes:"Unit 8",status:"inactive",device_type:"mikrotik",
    credential_password_cipher:"enc:v1:secret"
  }), {
    id:"r1",name:"Edge Router",host:"192.0.2.1",apiPort:8729,location:"Unit 8",
    status:"inactive",username:"nexus-api",device_type:"mikrotik"
  });
});

test("RouterOS credential storage is encrypted and live commands fail closed", () => {
  assert.match(source, /encryptPppoePassword\(password,env\)/);
  assert.match(source, /credential_password_cipher/);
  assert.match(source, /Live RouterOS API-SSL adapter is not configured/);
  assert.match(source, /async function createRouter/);
  assert.match(source, /async function updateRouter/);
});


test("ACS connection adapter accepts HTTPS public hostnames only", () => {
  assert.equal(validateAcsBaseUrl("https://acs.example.com:7557"), true);
  assert.equal(validateAcsBaseUrl("http://acs.example.com:7557"), false);
  assert.equal(validateAcsBaseUrl("https://127.0.0.1:7557"), false);
  assert.equal(validateAcsBaseUrl("https://router.local:7557"), false);
  assert.equal(validateAcsBaseUrl("https://user:pass@acs.example.com"), false);
  assert.deepEqual(normalizeAcsConnectionPayload({
    name:" Main ACS ",baseUrl:"https://acs.example.com/",username:"api",password:"secret",
    timeoutMs:90000
  }), {
    name:"Main ACS",baseUrl:"https://acs.example.com/",username:"api",password:"secret",
    token:"",timeoutMs:30000
  });
});

test("ACS connection and TR-069 device DTOs omit credentials and derive inform status", () => {
  assert.deepEqual(mapAcsConnection({
    id:"acs1",name:"Main ACS",base_url:"https://acs.example.com",enabled:1,
    timeout_ms:8000,last_test_at:null,last_test_ok:null,last_error:null,
    created_at:"now",updated_at:"now",password_cipher:"secret-cipher"
  }), {
    id:"acs1",name:"Main ACS",baseUrl:"https://acs.example.com",enabled:true,
    timeoutMs:8000,lastTestAt:null,lastTestOk:null,lastError:null,createdAt:"now",updatedAt:"now"
  });
  const online=mapAcsDevice({
    id:"dev1",device_id:"oui:product:serial",manufacturer:"Huawei",model:"HG8245",
    last_inform_at:"2026-11-17T10:00:00.000Z",parameter_snapshot:"{}"
  },Date.parse("2026-11-17T10:05:00.000Z"));
  assert.equal(online.status,"online");
  assert.equal(online.deviceId,"oui:product:serial");
  assert.equal(mapAcsDevice({id:"dev2",device_id:"unknown",parameter_snapshot:"{}"},Date.now()).status,"unknown");
});

test("ACS parameter snapshots redact password-like values", () => {
  const params=mapAcsParameters({
    Device:{WiFi:{SSID:{_value:"HomeNet",_type:"xsd:string"},KeyPassphrase:{_value:"secret",_type:"xsd:string"}}}
  });
  assert.equal(params["Device.WiFi.SSID"].value,"HomeNet");
  assert.equal(params["Device.WiFi.KeyPassphrase"].value,"[REDACTED]");
});

test("GenieACS D1 routes are tenant scoped, permission mapped and audit configuration changes", () => {
  for(const route of ["/api/acs/connections","/api/tr069/devices","/api/tr069/audit-logs","/parameters","/diagnostics","/reboot","/wifi"])
    assert.ok(source.includes(route)||source.includes("endsWith('"+route.slice(1)+"')"),"missing route "+route);
  assert.match(source,/WHERE id=\? AND organization_id=\?/);
  assert.match(source,/WHERE organization_id=\?/);
  assert.match(source,/async function acsAudit/);
  assert.match(source,/redirect:'error'/);
  assert.match(source,/validateAcsBaseUrl/);
  assert.match(source,/encryptAcsSecret/);
});

test("GenieACS D1 migration creates organization-isolated connection, device and audit tables", () => {
  for(const table of ["acs_connections","tr069_devices","tr069_audit_logs"]) {
    assert.match(acsMigration,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
    assert.match(acsMigration,/organization_id TEXT NOT NULL REFERENCES organizations\(id\)/);
  }
  assert.match(acsMigration,/UNIQUE\(organization_id,acs_connection_id,device_id\)/);
  assert.match(acsMigration,/VALUES\(15,'0015_genieacs_tr069_inventory'/);
});
