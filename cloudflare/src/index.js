const encoder = new TextEncoder();
const SESSION_DAYS = 7;
const PASSWORD_ITERATIONS = 100000;

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "vary": "Origin"
    }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function randomToken(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function passwordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256
  );
  return `${base64url(salt)}.${base64url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  const [saltText, expectedText] = String(stored || "").split(".");
  if (!saltText || !expectedText) return false;
  const actual = await passwordHash(password, fromBase64url(saltText));
  const actualBytes = fromBase64url(actual.split(".")[1]);
  const expectedBytes = fromBase64url(expectedText);
  if (actualBytes.length !== expectedBytes.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actualBytes.length; i++) mismatch |= actualBytes[i] ^ expectedBytes[i];
  return mismatch === 0;
}

function validEmail(email) {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "isp";
}

async function createSession(db, userId, tenantId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.prepare(
    "INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, tenantId, tokenHash, expiresAt).run();
  return token;
}

async function authenticate(request, db) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  return db.prepare(`
    SELECT u.id AS user_id, u.email, u.full_name, u.role,
           t.id AS tenant_id, t.name AS company_name, t.slug, t.status AS tenant_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active' AND t.status = 'active'
  `).bind(tokenHash, new Date().toISOString()).first();
}

async function handle(request, env) {
  const origin = request.headers.get("origin") || "*";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-max-age": "86400",
      "vary": "Origin"
    }});
  }
  if (!env.DB) return json({ success: false, error: "Database binding DB is not configured." }, 503, origin);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (request.method === "GET" && path === "/api/health") {
    return json({ success: true, service: "NEXUS SaaS API", database: "D1", status: "online" }, 200, origin);
  }

  if (request.method === "POST" && path === "/api/auth/register") {
    let body;
    try { body = await request.json(); } catch { return json({ success: false, error: "Valid JSON is required." }, 400, origin); }
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (companyName.length < 2 || companyName.length > 100 || fullName.length < 2 || fullName.length > 100 ||
        !validEmail(email) || password.length < 12 || password.length > 128) {
      return json({ success: false, error: "Company, full name, valid email and a 12-128 character password are required." }, 400, origin);
    }

    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) return json({ success: false, error: "This email is already registered." }, 409, origin);

    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const slug = `${slugify(companyName)}-${randomToken(4).toLowerCase()}`;
    const hash = await passwordHash(password);
    const now = new Date().toISOString();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO tenants (id, name, slug, status, created_at) VALUES (?, ?, ?, 'active', ?)")
          .bind(tenantId, companyName, slug, now),
        env.DB.prepare("INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, 'owner', 'active', ?)")
          .bind(userId, tenantId, email, hash, fullName, now),
        env.DB.prepare("INSERT INTO tenant_subscriptions (id, tenant_id, plan_code, status, trial_ends_at, created_at) VALUES (?, ?, 'trial', 'trialing', ?, ?)")
          .bind(crypto.randomUUID(), tenantId, new Date(Date.now() + 14 * 86400000).toISOString(), now)
      ]);
    } catch (error) {
      const duplicate = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (duplicate) return json({ success: false, error: "This email is already registered." }, 409, origin);
      console.error("Tenant registration failed", error);
      return json({ success: false, error: "Registration could not be completed." }, 500, origin);
    }
    const token = await createSession(env.DB, userId, tenantId);
    return json({ success: true, token, user: { id: userId, email, fullName, role: "owner" },
      tenant: { id: tenantId, name: companyName, slug }, trialDays: 14 }, 201, origin);
  }

  if (request.method === "POST" && path === "/api/auth/login") {
    let body;
    try { body = await request.json(); } catch { return json({ success: false, error: "Valid JSON is required." }, 400, origin); }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!validEmail(email) || !password || password.length > 128) return json({ success: false, error: "Invalid email or password." }, 400, origin);
    const user = await env.DB.prepare(
      "SELECT id, tenant_id, email, full_name, role, password_hash FROM users WHERE email = ? AND status = 'active'"
    ).bind(email).first();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return json({ success: false, error: "Invalid email or password." }, 401, origin);
    }
    const tenant = await env.DB.prepare("SELECT id, name, slug FROM tenants WHERE id = ? AND status = 'active'").bind(user.tenant_id).first();
    if (!tenant) return json({ success: false, error: "Workspace is unavailable." }, 403, origin);
    const token = await createSession(env.DB, user.id, user.tenant_id);
    return json({ success: true, token, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role }, tenant }, 200, origin);
  }

  if (request.method === "GET" && path === "/api/auth/me") {
    const user = await authenticate(request, env.DB);
    if (!user) return json({ success: false, error: "Authentication required." }, 401, origin);
    return json({ success: true, user: { id: user.user_id, email: user.email, fullName: user.full_name, role: user.role },
      tenant: { id: user.tenant_id, name: user.company_name, slug: user.slug } }, 200, origin);
  }

  if (request.method === "POST" && path === "/api/auth/logout") {
    const header = request.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
    if (match) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(match[1])).run();
    return json({ success: true }, 200, origin);
  }

  return json({ success: false, error: "Route not found." }, 404, origin);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error("NEXUS request failed", error);
      return json({ success: false, error: "An unexpected server error occurred." }, 500);
    }
  }
};
