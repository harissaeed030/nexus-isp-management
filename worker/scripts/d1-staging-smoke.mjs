import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const base = (process.env.NEXUS_STAGING_API_URL || "https://nexus-saas-api-staging.harissaeed030.workers.dev").replace(/\/$/, "");
const origin = "https://nexus-isp-management.pages.dev";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = randomBytes(24).toString("base64url");

async function call(path, { method = "GET", token, body, originHeader } = {}, expected = 200) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (originHeader) headers.origin = originHeader;
  const response = await fetch(base + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 300) }; }
  assert.equal(response.status, expected, `${method} ${path}: expected HTTP ${expected}, got ${response.status}; ${data.error || data.message || "no error detail"}`);
  return { response, data };
}

async function register(label) {
  const id = `${suffix}-${label}`;
  const email = `nexus-smoke-${id}@example.com`;
  const slug = `nexus-smoke-${id}`;
  const { data } = await call("/api/auth/register", {
    method: "POST",
    body: { companyName: `NEXUS Staging Smoke ${id}`, slug, email, password, name: "Staging Smoke Owner" }
  }, 201);
  assert.ok(data.success && data.token && data.user?.orgId, "registration must return owner token and organization");
  console.log(`SMOKE_TENANT_${label.toUpperCase()}=${data.user.orgId}`);
  return { email, slug, token: data.token, orgId: data.user.orgId };
}

const health = await call("/api/health");
assert.equal(health.data.status, "healthy", "D1 health endpoint");
console.log("PASS health + D1 binding");

const preflight = await fetch(base + "/api/auth/login", {
  method: "OPTIONS",
  headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" }
});
assert.equal(preflight.status, 204, "CORS preflight status");
assert.equal(preflight.headers.get("access-control-allow-origin"), origin, "CORS allowed origin");
console.log("PASS Pages CORS origin");

const tenantA = await register("a");
const tenantB = await register("b");
const login = await call("/api/auth/login", {
  method: "POST",
  body: { email: tenantA.email, password, workspace: tenantA.slug }
});
assert.ok(login.data.success && login.data.token, "owner login returns token");
const tokenA = login.data.token;
const me = await call("/api/auth/me", { token: tokenA });
assert.equal(me.data.user?.role, "owner");
assert.equal(me.data.tenant?.slug, tenantA.slug);
console.log("PASS owner registration, login and current-user API");

const customer = await call("/api/customers", {
  method: "POST",
  token: tokenA,
  body: { first_name: "Smoke", last_name: "Customer", phone: "03000000000", city: "Hyderabad", status: "active" }
}, 201);
const customerId = customer.data.id;
assert.ok(customerId, "customer ID returned");

const packageResult = await call("/api/packages", {
  method: "POST",
  token: tokenA,
  body: { name: "Smoke 10 Mbps", speed_mbps: 10, speed_down: "10M", speed_up: "10M", price: 1000, billing_cycle: "monthly", is_active: true }
}, 201);
const packageId = packageResult.data.id;
assert.ok(packageId, "package ID returned");

const today = new Date().toISOString().slice(0, 10);
const subscription = await call("/api/subscriptions", {
  method: "POST",
  token: tokenA,
  body: { customer_id: customerId, package_id: packageId, start_date: today, status: "active", auto_renew: true }
}, 201);
assert.ok(subscription.data.id, "subscription ID returned");
console.log("PASS customer, package and subscription APIs");

const billingPeriod = today.slice(0, 7);
const generated = await call("/api/billing/generate", {
  method: "POST",
  token: tokenA,
  body: { period: billingPeriod }
});
assert.equal(generated.data.success, true);
assert.ok(generated.data.invoicesCreated >= 1, "monthly billing should create an invoice for the active test subscription");

const invoice = await call("/api/invoices", {
  method: "POST",
  token: tokenA,
  body: { customer_id: customerId, subscription_id: subscription.data.id, amount: 1000, issue_date: today, notes: "Automated staging smoke test" }
}, 201);
assert.ok(invoice.data.id, "invoice ID returned");

const payment = await call(`/api/invoices/${invoice.data.id}/payments`, {
  method: "POST",
  token: tokenA,
  body: { amount: 1000, method: "cash", reference: `SMOKE-${suffix}`, notes: "Automated staging smoke test" }
}, 201);
assert.ok(payment.data.id, "payment ID returned");
const paidInvoice = await call(`/api/invoices/${invoice.data.id}`, { token: tokenA });
assert.equal(paidInvoice.data.status, "paid", "full payment should settle invoice");
console.log("PASS monthly billing, invoice creation, payment collection and settlement");

const customerList = await call("/api/customers", { token: tokenA });
assert.ok(customerList.data.data?.some(x => x.id === customerId), "customer appears in tenant list");
const invoiceList = await call("/api/invoices", { token: tokenA });
assert.ok(invoiceList.data.data?.some(x => x.id === invoice.data.id), "invoice appears in tenant list");
const paymentList = await call("/api/payments", { token: tokenA });
assert.ok(paymentList.data.data?.some(x => x.id === payment.data.id), "payment appears in tenant list");
console.log("PASS customer and billing read APIs");

const crossTenant = await call(`/api/customers/${customerId}`, { token: tenantB.token }, 404);
assert.equal(crossTenant.data.error, "Not found");
const tenantBList = await call("/api/customers", { token: tenantB.token });
assert.equal(tenantBList.data.data?.length, 0, "tenant B cannot see tenant A customers");
await call("/api/customers", {}, 401);
console.log("PASS tenant isolation and unauthenticated request rejection");

console.log(`SMOKE_CLEANUP_ORG_IDS=${tenantA.orgId},${tenantB.orgId}`);
console.log("D1 staging API smoke tests passed. Synthetic tenant cleanup is pending the post-run cleanup step.");
