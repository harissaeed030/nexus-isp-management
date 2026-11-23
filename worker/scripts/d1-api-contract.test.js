import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeWorkspaceLoginSlug, normalizeApiMethod, normalizeApiPath, mapTicketRow, normalizeTicketPayload, mapCustomerRow, normalizeCustomerPayload, mapPackageRow, normalizePackagePayload, mapSubscriptionRow, normalizeSubscriptionPayload, mapInvoiceRow, normalizeInvoicePayload, mapPaymentRow, normalizePaymentPayload, mapOltRow, mapOnuRow, normalizeOnuPayload, mapRouterRow, validateAcsBaseUrl, mapAcsConnection, mapAcsDevice, mapAcsParameters, normalizeAcsConnectionPayload, corsHeaders, hashPw, verifyPw, needsPasswordUpgrade } from "../src/d1-api-worker.js";

const source = await readFile(new URL("../src/d1-api-worker.js", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../../assets/js/app.js", import.meta.url), "utf8");
const config = await readFile(new URL("../wrangler.api.toml", import.meta.url), "utf8");
const customerMigration = await readFile(new URL("../../cloudflare/d1/migrations/0012_customer_workspace_compatibility.sql", import.meta.url), "utf8");
const subscriptionMigration = await readFile(new URL("../../cloudflare/d1/migrations/0013_subscription_workspace_status.sql", import.meta.url), "utf8");
const acsMigration = await readFile(new URL("../../cloudflare/d1/migrations/0015_genieacs_tr069_inventory.sql", import.meta.url), "utf8");
const routerMappingMigration = await readFile(new URL("../../cloudflare/d1/migrations/0016_router_customer_pppoe_mappings.sql", import.meta.url), "utf8");
const userPasswordGuardMigration = await readFile(new URL("../../cloudflare/d1/migrations/0017_users_password_hash_guard.sql", import.meta.url), "utf8");

test("D1 API Worker includes authenticated organization registration and login", () => {
  assert.match(source, /\/api\/auth\/register/);
  assert.match(source, /\/api\/auth\/login/);
  assert.match(source, /verifyJWT/);
  assert.match(source, /tokenVersion/);
});

test("dashboard workspace registration URL is normalized to the D1 auth registration handler", () => {
  assert.equal(normalizeApiPath("/api/v1/tenants/register"), "/api/auth/register");
  assert.equal(normalizeApiPath("/api/v1/auth/login"), "/api/auth/login");
  assert.equal(normalizeApiPath("/api/v1/customers"), "/api/customers");
  assert.match(dashboardSource, /\/api\/v1\/tenants\/register/);
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


test("Router PPPoE customer mapping is tenant scoped and never stores PPPoE passwords", () => {
  assert.match(source,/async function mapRouterCustomer/);
  assert.match(source,/router_customer_mappings/);
  assert.match(source,/customers WHERE id=\? AND organization_id=\?/);
  assert.match(source,/device_type='mikrotik'/);
  assert.match(source,/mapRouterCustomer\(request,env,path,orgId,userId,ip\)/);
  assert.match(source,/does not create, change or verify a live RouterOS PPPoE account/);
  assert.match(routerMappingMigration,/CREATE TABLE IF NOT EXISTS router_customer_mappings/);
  assert.match(routerMappingMigration,/UNIQUE\(organization_id,router_id,pppoe_username\)/);
  assert.doesNotMatch(routerMappingMigration,/password/i);
});


test("RouterOS credential encryption uses a separate key context from PPPoE and ACS secrets", () => {
  assert.match(source,/NEXUS-ROUTER-CREDENTIAL-SALT-V1/);
  assert.match(source,/NEXUS-ROUTEROS-API-CREDENTIAL-ENCRYPTION/);
  assert.match(source,/return 'rtr:v1:'/);
  assert.match(source,/encryptRouterCredential\(password,env\)/);
  assert.match(source,/encryptRouterCredential\(b\.password,env\)/);
  assert.match(source,/export async function decryptRouterCredential/);
});


test("TR-069 dashboard supports ACS enable, disable and delete actions", () => {
  assert.match(dashboardSource,/data-acs-toggle/);
  assert.match(dashboardSource,/data-acs-delete/);
  assert.match(dashboardSource,/method:"PATCH",body:JSON\.stringify\(\{enabled:/);
  assert.match(dashboardSource,/method:"DELETE"/);
});


test("D1 users require a non-empty password hash on insert and update", () => {
  assert.match(userPasswordGuardMigration, /BEFORE INSERT ON users/);
  assert.match(userPasswordGuardMigration, /NEW\.password_hash IS NULL/);
  assert.match(userPasswordGuardMigration, /BEFORE UPDATE OF password_hash ON users/);
  assert.match(userPasswordGuardMigration, /users\.password_hash is required/);
  assert.match(userPasswordGuardMigration, /VALUES \(17, '0017_users_password_hash_guard'/);
});

const reconciliationMigration = await readFile(new URL("../../cloudflare/d1/migrations/0018_reconcile_pppoe_and_sync_guards.sql", import.meta.url), "utf8");

test("D1 migration 0018 tightens PPPoE router tenant/type guards and sync idempotency index", () => {
  assert.match(reconciliationMigration, /DROP TRIGGER IF EXISTS trg_d1_pppoe_router_org_i/);
  assert.match(reconciliationMigration, /device_type = 'mikrotik'/);
  assert.match(reconciliationMigration, /BEFORE UPDATE OF organization_id, router_id ON pppoe_accounts/);
  assert.match(reconciliationMigration, /ON sync_operations\(organization_id, entity_type, entity_id\)/);
  assert.match(reconciliationMigration, /VALUES \(10, '0010_pppoe_connection_metadata'/);
  assert.match(reconciliationMigration, /VALUES \(18, '0018_reconcile_pppoe_and_sync_guards'/);
});

const userEmailParityMigration = await readFile(new URL("../../cloudflare/d1/migrations/0019_restore_case_insensitive_user_email_uniqueness.sql", import.meta.url), "utf8");
const workspaceEmailMigration = await readFile(new URL("../../cloudflare/d1/migrations/0020_allow_workspace_scoped_user_emails.sql", import.meta.url), "utf8");
const fieldOperationsMigration = await readFile(new URL("../../cloudflare/d1/migrations/0021_field_operations.sql", import.meta.url), "utf8");

test("D1 migration 0019 restores case-insensitive organization-scoped user email uniqueness", () => {
  assert.match(userEmailParityMigration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_email_ci_guard_0019/);
  assert.match(userEmailParityMigration, /DROP INDEX IF EXISTS idx_users_org_email_ci/);
  assert.match(userEmailParityMigration, /CREATE UNIQUE INDEX idx_users_org_email_ci/);
  assert.match(userEmailParityMigration, /ON users.*organization_id.*lower.*email/);
  assert.match(userEmailParityMigration, /VALUES\(19,'0019_restore_case_insensitive_user_email_uniqueness'/);
});

test("workspace login normalizes all supported workspace slug aliases", () => {
  assert.equal(normalizeWorkspaceLoginSlug({ workspace: "  VanCom-ISP " }), "vancom-isp");
  assert.equal(normalizeWorkspaceLoginSlug({ tenantSlug: "VanCom-ISP" }), "vancom-isp");
  assert.equal(normalizeWorkspaceLoginSlug({ tenant_slug: "VanCom-ISP" }), "vancom-isp");
  assert.equal(normalizeWorkspaceLoginSlug({ tenantSlug: "  " }), null);
  assert.equal(normalizeWorkspaceLoginSlug({}), null);
  assert.match(source, /if\(rows\.length>1\)return json\(/);
});

test("D1 migration 0020 removes global email uniqueness while retaining workspace-scoped uniqueness", () => {
  assert.match(workspaceEmailMigration, /DROP INDEX IF EXISTS idx_users_email_global/);
  assert.match(workspaceEmailMigration, /VALUES\(20,'0020_allow_workspace_scoped_user_emails'/);
  assert.match(userEmailParityMigration, /CREATE UNIQUE INDEX idx_users_org_email_ci/);
  assert.match(source, /const workspace=normalizeWorkspaceLoginSlug\(b\)/);
  assert.match(source, /if\(rows\.length>1\)return json\(/);
});


test("D1 field operations APIs are tenant-isolated and cover the dashboard operations modules", () => {
  for (const route of ["/api/operations/locations", "/api/operations/assignments", "/api/operations/coverage-areas", "/api/operations/applications", "/api/operations/partners", "/api/operations/recovery-officers", "/api/operations/collections", "/api/operations/payment-promises", "/api/operations/inventory", "/api/operations/customer-ledger"]) {
    assert.ok(source.includes(route), "Missing field operations route: " + route);
  }
  assert.match(source, /async function handleOperations/);
  assert.match(source, /WHERE id=\? AND organization_id=\?/);
  assert.match(source, /idx_ops_ledger_customer/);
});

test("D1 migration 0021 creates the full tenant-scoped field operations schema", () => {
  for (const table of ["geo_locations", "coverage_areas", "connection_applications", "business_partners", "recovery_officers", "field_assignments", "cash_collections", "payment_promises", "inventory_items", "inventory_movements", "customer_ledger_entries"]) {
    assert.match(fieldOperationsMigration, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  }
  assert.match(fieldOperationsMigration, /organization_id TEXT NOT NULL/);
  assert.match(fieldOperationsMigration, /VALUES\(21,'0021_field_operations'/);
  assert.match(source, /ops\.geo_locations/);
  assert.match(source, /ops\.index_ledger/);
});


test("D1 user-table compatibility rebuild runs before operations foreign-key tables are created", () => {
  assert.ok(source.indexOf("['users.rebuild','SPECIAL']") < source.indexOf("['ops.geo_locations'"));
});


test("D1 Worker AI endpoint keeps Gemini credentials server-side and validates bounded chat history", () => {
  assert.match(source, /async function handleAiChat/);
  assert.match(source, /env\.GEMINI_API_KEY/);
  assert.match(source, /x-goog-api-key/);
  assert.match(source, /MAX_HISTORY|messages\.length>12/);
  assert.match(source, /aiRecentRequests/);
  assert.match(source, /path==='\/api\/ai\/chat'&&m==='POST'/);
  assert.match(source, /The latest message must be from you/);
});


test("D1 Worker AI defaults to the same Gemini model as the local backend", () => {
  assert.match(source, /GEMINI_MODEL\|\|'gemini-2\.5-flash'/);
});


test("Worker password verification rejects plaintext or malformed credentials and compares derived hashes without early exit", () => {
  assert.match(source, /PASSWORD_HASH_ITERATIONS=600000/);
  assert.match(source, /LEGACY_PASSWORD_HASH_ITERATIONS=100000/);
  assert.match(source, /safeHashEqual/);
  assert.doesNotMatch(source, /if\(!salt\)return pw===h/);
});

test("D1 password hashes are versioned PBKDF2-SHA256 and reject plaintext fallback", async () => {
  const credentials = await hashPw("Nexus-Strong-Password-2026!");
  assert.match(credentials.salt, /^v2:600000:[0-9a-f]{32}$/);
  assert.equal(needsPasswordUpgrade(credentials.salt), false);
  assert.equal(await verifyPw("Nexus-Strong-Password-2026!", credentials.hash, credentials.salt), true);
  assert.equal(await verifyPw("wrong-password", credentials.hash, credentials.salt), false);
  assert.equal(await verifyPw("plaintext", "plaintext", null), false);
  assert.equal(await verifyPw("password", "not-a-hash", "not-a-salt"), false);
});

test("legacy salted 100,000-iteration hashes verify and are marked for transparent upgrade", async () => {
  const saltBytes = new Uint8Array(16).fill(7);
  const salt = Array.from(saltBytes).map(value => value.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("Legacy-Password-2026!"), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" }, key, 256);
  const hash = Array.from(new Uint8Array(bits)).map(value => value.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifyPw("Legacy-Password-2026!", hash, salt), true);
  assert.equal(await verifyPw("incorrect", hash, salt), false);
  assert.equal(needsPasswordUpgrade(salt), true);
});


test("CORS accepts the NEXUS Pages production host and HTTPS preview deployments only", () => {
  const allowed = "https://071fff80.nexus-isp-management.pages.dev";
  const preview = corsHeaders(new Request("https://api.example.com", {headers:{Origin:allowed}}), {});
  assert.equal(preview.get("Access-Control-Allow-Origin"), allowed);
  const production = "https://nexus-isp-management.pages.dev";
  assert.equal(corsHeaders(new Request("https://api.example.com", {headers:{Origin:production}}), {}).get("Access-Control-Allow-Origin"), production);
  const lookalike = "https://nexus-isp-management.pages.dev.evil.example";
  assert.equal(corsHeaders(new Request("https://api.example.com", {headers:{Origin:lookalike}}), {}).get("Access-Control-Allow-Origin"), null);
  const insecure = "http://071fff80.nexus-isp-management.pages.dev";
  assert.equal(corsHeaders(new Request("https://api.example.com", {headers:{Origin:insecure}}), {}).get("Access-Control-Allow-Origin"), null);
});


test("customer portal authentication is tenant-scoped and token-version revocation is enforced",()=>{
  assert.match(source,/if\(path==='\/api\/portal\/auth\/login'&&m==='POST'\)return await portalLogin/);
  assert.match(source,/a\.organization_id=\? AND a\.status='active'/);
  assert.match(source,/c\.organization_id=a\.organization_id/);
  assert.match(source,/tokenVersion:Number\(account\.token_version\|\|0\)/);
  assert.match(source,/Number\(account\.token_version\|\|0\)!==Number\(auth\.tokenVersion\|\|0\)/);
  assert.match(source,/UPDATE customer_portal_accounts SET token_version=COALESCE\(token_version,0\)\+1/);
  assert.match(source,/async function changePortalPassword/);
});

test("customer portal dashboard queries constrain customer and organization together",()=>{
  const start=source.indexOf("async function handlePortalApi");
  const end=source.indexOf("async function authReg",start);
  const portal=source.slice(start,end);
  assert.match(portal,/WHERE i\.organization_id=\? AND i\.customer_id=\?/);
  assert.match(portal,/WHERE p\.organization_id=\? AND p\.customer_id=\?/);
  assert.match(portal,/WHERE organization_id=\? AND customer_id=\?/);
});
