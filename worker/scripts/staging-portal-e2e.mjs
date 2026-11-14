import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = (process.env.NEXUS_STAGING_URL || 'https://nexus-saas-api-staging.harissaeed030.workers.dev').replace(/\/$/, '');
const suffix = randomUUID().replaceAll('-', '').slice(0, 18);
const tenantSlug = `nexus-stage-${suffix}`;
const ownerEmail = `owner-${suffix}@nexus.invalid`;
const portalEmail = `portal-${suffix}@nexus.invalid`;
const password = 'Nexus-Staging-Only-2026!';
const checks = [];

let ownerToken = null;
let failure = null;
let cleanup = { attempted: false, success: false, reason: 'Tenant was not registered or owner token was not returned' };

async function request(method, path, body, token) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { status: response.status, data, headers: response.headers };
}

function ok(label, response, expected) {
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, got ${response.status}: ${JSON.stringify(response.data)}`);
  checks.push(label);
  return response.data;
}

try {
  const health = await request('GET', '/api/health');
  ok('health endpoint and D1 connectivity', health, 200);
  assert.equal(health.data.status, 'healthy');

  const registration = await request('POST', '/api/auth/register', {
    companyName: `NEXUS staging smoke ${suffix}`,
    slug: tenantSlug,
    email: ownerEmail,
    password,
    name: 'Staging Smoke Owner'
  });
  const owner = ok('tenant registration', registration, 201);
  assert.equal(owner.success, true);
  assert.equal(owner.user.role, 'owner');
  ownerToken = owner.token;
  assert.ok(ownerToken, 'tenant registration must return an owner token');

  const me = await request('GET', '/api/auth/me', undefined, ownerToken);
  ok('owner authentication and tenant identity', me, 200);
  assert.equal(me.data.tenant.slug, tenantSlug);

  const customerResult = await request('POST', '/api/customers', {
    first_name: 'Portal', last_name: 'Smoke Customer',
    email: portalEmail, phone: '03000000000', city: 'Hyderabad'
  }, ownerToken);
  const customer = ok('customer creation', customerResult, 201);
  assert.ok(customer.id);

  const packageResult = await request('POST', '/api/packages', {
    name: 'Smoke 10 Mbps', speed_mbps: 10, speed_down: '10 Mbps',
    speed_up: '10 Mbps', price: 1000, billing_cycle: 'monthly'
  }, ownerToken);
  const pkg = ok('package creation', packageResult, 201);
  assert.ok(pkg.id);

  const subscriptionResult = await request('POST', '/api/subscriptions', {
    customer_id: customer.id, package_id: pkg.id, auto_renew: true
  }, ownerToken);
  const subscription = ok('subscription creation', subscriptionResult, 201);
  assert.ok(subscription.id);

  const invoiceResult = await request('POST', '/api/invoices', {
    customer_id: customer.id, subscription_id: subscription.id, amount: 1000,
    issue_date: new Date().toISOString().slice(0, 10)
  }, ownerToken);
  const invoice = ok('invoice creation', invoiceResult, 201);
  assert.ok(invoice.id);

  const accountResult = await request('POST', `/api/customers/${customer.id}/portal-account`, {
    email: portalEmail, password, status: 'active'
  }, ownerToken);
  const account = ok('customer portal account provisioning', accountResult, 201);
  assert.equal(account.success, true);

  const portalLogin = await request('POST', '/api/portal/auth/login', {
    workspace: tenantSlug, email: portalEmail, password
  });
  const portal = ok('customer portal login', portalLogin, 200);
  assert.equal(portal.success, true);
  const portalToken = portal.token;
  assert.ok(portalToken);

  for (const path of [
    '/api/portal/me',
    '/api/portal/dashboard',
    '/api/portal/subscriptions',
    '/api/portal/invoices',
    '/api/portal/payments',
    '/api/portal/tickets'
  ]) {
    const result = await request('GET', path, undefined, portalToken);
    ok(`portal read ${path}`, result, 200);
  }

  const portalInvoiceResult = await request('GET', '/api/portal/invoices', undefined, portalToken);
  const invoiceRows = portalInvoiceResult.data.data || portalInvoiceResult.data.invoices || [];
  assert.ok(invoiceRows.some(row => row.id === invoice.id), 'customer portal must show its own invoice');
  checks.push('customer sees own invoice');

  const ticketResult = await request('POST', '/api/portal/tickets', {
    subject: 'Staging smoke test complaint',
    description: 'Automated staging-only customer portal E2E test'
  }, portalToken);
  ok('customer complaint submission', ticketResult, 201);

  const logout = await request('POST', '/api/portal/auth/logout', {}, portalToken);
  ok('customer portal logout', logout, 200);
  const revoked = await request('GET', '/api/portal/me', undefined, portalToken);
  ok('customer portal token revocation', revoked, 401);

  const missingAuth = await request('GET', '/api/customers');
  ok('unauthenticated admin API rejection', missingAuth, 401);
} catch (error) {
  failure = error?.stack || String(error);
} finally {
  // Always attempt tenant-scoped teardown, even when an assertion or request fails.
  // The API permits this only on the exact staging hostname and for this run's tenant slug.
  if (ownerToken) {
    cleanup = { attempted: true, success: false };
    try {
      const response = await request('DELETE', '/api/e2e/tenant', { slug: tenantSlug }, ownerToken);
      assert.equal(response.status, 200, `staging tenant cleanup expected HTTP 200, got ${response.status}: ${JSON.stringify(response.data)}`);
      assert.equal(response.data?.success, true, 'staging tenant cleanup must confirm success');
      assert.equal(response.data?.deletedTenant, tenantSlug, 'cleanup must confirm the exact synthetic tenant');
      cleanup = { attempted: true, success: true, status: response.status, deletedTenant: response.data.deletedTenant };
      checks.push('finally cleanup of synthetic staging tenant');
    } catch (error) {
      cleanup = { attempted: true, success: false, error: error?.message || String(error) };
      failure = [failure, `CLEANUP FAILED: ${cleanup.error}`].filter(Boolean).join('\n');
    }
  }
}

const result = failure ? 'FAIL' : 'PASS';
console.log(JSON.stringify({ result, checks, tenantSlug, cleanup, ...(failure ? { error: failure } : {}) }, null, 2));
if (failure || !cleanup.success) process.exitCode = 1;
