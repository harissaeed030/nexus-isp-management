import assert from "node:assert/strict";

const base = (process.env.NEXUS_STAGING_API || "").replace(/\/$/, "");
assert.ok(base, "NEXUS_STAGING_API is required");
assert.equal(new URL(base).hostname, "nexus-saas-api-staging.harissaeed030.workers.dev", "Refusing to run tenant-creating E2E tests outside the staging Worker");

const runId = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^0-9]/g, "");
const attempt = String(process.env.GITHUB_RUN_ATTEMPT || "1").replace(/[^0-9]/g, "") || "1";
const password = "NexusE2E-" + runId + "-" + attempt + "-Owner!";
const portalPassword = "PortalE2E-" + runId + "-" + attempt + "!";

const tenants = [];

async function request(path, { method = "GET", token, body, expected = 200 } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  assert.equal(response.status, expected, method + " " + path + " returned " + response.status + "; expected " + expected + "; body=" + raw.slice(0, 400));
  return data;
}

async function createTenant(label) {
  const slug = "nexus-stage-" + runId + "-" + attempt + "-" + label;
  const email = "owner-" + runId + "-" + attempt + "-" + label + "@e2e.invalid";
  const result = await request("/api/auth/register", {
    method: "POST",
    expected: 201,
    body: {
      companyName: "NEXUS Staging E2E " + label.toUpperCase(),
      slug,
      email,
      password,
      name: "NEXUS E2E Owner " + label.toUpperCase(),
    },
  });
  assert.ok(result.token, "Registration must return an owner token");
  assert.ok(result.user?.orgId, "Registration must return an organization ID");
  const tenant = { slug, email, token: result.token, orgId: result.user.orgId };
  tenants.push(tenant);
  return tenant;
}

async function createCustomer(tenant, label) {
  const email = "customer-" + runId + "-" + attempt + "-" + label + "@e2e.invalid";
  const customer = await request("/api/customers", {
    method: "POST",
    token: tenant.token,
    expected: 201,
    body: {
      first_name: "E2E " + label.toUpperCase(),
      last_name: "Customer",
      email,
      phone: "03000000000",
      status: "active",
    },
  });
  assert.ok(customer.id, "Customer creation must return an ID");
  return { ...customer, email };
}

try {
  const tenantA = await createTenant("a");
  const tenantB = await createTenant("b");
  const customerA = await createCustomer(tenantA, "a");
  const customerB = await createCustomer(tenantB, "b");

  const isolatedRead = await request("/api/customers/" + encodeURIComponent(customerB.id), {
    token: tenantA.token,
    expected: 404,
  });
  assert.equal(isolatedRead.error, "Not found", "Cross-tenant customer reads must be hidden");

  const isolatedPortalSetup = await request("/api/customers/" + encodeURIComponent(customerB.id) + "/portal-account", {
    method: "POST",
    token: tenantA.token,
    expected: 404,
    body: { email: customerB.email, password: portalPassword },
  });
  assert.equal(isolatedPortalSetup.error, "Customer not found", "Cross-tenant portal account creation must be denied");

  const portalSetup = await request("/api/customers/" + encodeURIComponent(customerA.id) + "/portal-account", {
    method: "POST",
    token: tenantA.token,
    expected: 201,
    body: { email: customerA.email, password: portalPassword, status: "active" },
  });
  assert.equal(portalSetup.success, true);

  const portalLogin = await request("/api/portal/auth/login", {
    method: "POST",
    expected: 200,
    body: { workspace: tenantA.slug, email: customerA.email, password: portalPassword },
  });
  assert.ok(portalLogin.token, "Customer portal login must return a token");

  const me = await request("/api/portal/me", { token: portalLogin.token });
  assert.equal(me.customer?.id, customerA.id);
  assert.equal(me.tenant?.slug, tenantA.slug);
  assert.notEqual(me.customer?.id, customerB.id);

  const dashboard = await request("/api/portal/dashboard", { token: portalLogin.token });
  assert.ok(Array.isArray(dashboard.subscriptions));
  assert.ok(Array.isArray(dashboard.recentInvoices));
  assert.ok(Array.isArray(dashboard.recentPayments));

  const ticket = await request("/api/portal/tickets", {
    method: "POST",
    token: portalLogin.token,
    expected: 201,
    body: { subject: "Temporary NEXUS staging E2E ticket", description: "This ticket is removed by the staging E2E cleanup." },
  });
  assert.ok(ticket.id, "Portal ticket creation must return an ID");
  const tickets = await request("/api/portal/tickets", { token: portalLogin.token });
  assert.ok(tickets.data.some((item) => item.id === ticket.id), "Customer must see their own portal ticket");

  await request("/api/portal/auth/logout", { method: "POST", token: portalLogin.token });
  await request("/api/portal/me", { token: portalLogin.token, expected: 401 });

  console.log("Staging portal E2E passed: tenant isolation, portal provisioning, login, profile, dashboard, tickets and logout.");
} finally {
  const cleanupErrors = [];
  for (const tenant of tenants.reverse()) {
    try {
      const result = await request("/api/e2e/tenant", {
        method: "DELETE",
        token: tenant.token,
        body: { slug: tenant.slug },
        expected: 200,
      });
      assert.equal(result.success, true);
      console.log("Cleaned synthetic staging tenant: " + tenant.slug);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Failed to clean one or more synthetic staging tenants; inspect the staging E2E logs.");
  }
}
