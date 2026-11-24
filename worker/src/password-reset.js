const GENERIC_RESET_MESSAGE = "If an active account matches those details, password reset instructions will be sent to its registered email address.";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
async function parseBody(request) { try { return await request.json(); } catch { return null; } }
function uuid() { return crypto.randomUUID(); }
function base64Url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" }, key, 256);
  const hash = Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
  const salt = Array.from(saltBytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return { hash, salt };
}
async function loginRateLimited(db, ip, email) {
  await db.prepare("DELETE FROM login_attempts WHERE attempted_at<datetime('now','-1 day')").run();
  const [byIp, byEmail] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_address=? AND attempted_at>=datetime('now','-15 minutes')").bind(ip).first(),
    db.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE email=? AND attempted_at>=datetime('now','-15 minutes')").bind(email).first()
  ]);
  return Number(byIp?.n || 0) >= 30 || Number(byEmail?.n || 0) >= 10;
}
async function recordAttempt(db, ip, email) {
  await db.prepare("INSERT INTO login_attempts(id,ip_address,email) VALUES(?,?,?)").bind(uuid(), ip, email).run();
}
function resetPageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url;
  } catch { return null; }
}
async function sendResetEmail(env, email, link) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.PASSWORD_RESET_FROM,
      to: [email],
      subject: "NEXUS account password reset",
      text: "A password reset was requested for your NEXUS account. This one-time link expires in 30 minutes:\n\n" +
        link + "\n\nIf you did not request this, ignore this email. Your password will not change unless the link is used."
    })
  });
  if (!response.ok) throw new Error("Password reset email provider rejected the request");
}
async function auditReset(db, organizationId, userId, action, ip) {
  try {
    await db.prepare("INSERT INTO audit_log(id,organization_id,user_id,action,detail,ip_address) VALUES(?,?,?,?,?,?)")
      .bind(uuid(), organizationId, userId, action, "Password reset workflow", ip || null).run();
  } catch { /* Do not expose audit details to the public caller. */ }
}
export async function requestPasswordReset(request, env, ip = "unknown") {
  const body = await parseBody(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const workspace = typeof body?.workspaceSlug === "string" ? body.workspaceSlug.trim().toLowerCase() : "";
  const rateKey = email.slice(0, 254) || "invalid";
  if (await loginRateLimited(env.DB, ip, rateKey)) return json({ success: true, message: GENERIC_RESET_MESSAGE });
  await recordAttempt(env.DB, ip, rateKey);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      (workspace && (!/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(workspace) && !/^[a-z0-9]$/.test(workspace)))) {
    return json({ success: true, message: GENERIC_RESET_MESSAGE });
  }
  const resetPage = resetPageUrl(env.PASSWORD_RESET_URL);
  if (!env.RESEND_API_KEY || !env.PASSWORD_RESET_FROM || !resetPage) {
    return json({ success: true, message: GENERIC_RESET_MESSAGE });
  }
  const matches = workspace
    ? await env.DB.prepare("SELECT u.id,u.email,u.organization_id FROM users u JOIN organizations o ON o.id=u.organization_id WHERE lower(u.email)=? AND lower(o.slug)=? AND COALESCE(u.status,'active')='active' LIMIT 2").bind(email, workspace).all()
    : await env.DB.prepare("SELECT id,email,organization_id FROM users WHERE lower(email)=? AND COALESCE(status,'active')='active' LIMIT 2").bind(email).all();
  const accounts = matches?.results || [];
  if (accounts.length !== 1) return json({ success: true, message: GENERIC_RESET_MESSAGE });
  const account = accounts[0];
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE password_resets SET used=1 WHERE user_id=? AND used=0").bind(account.id),
    // The legacy token column stores only a SHA-256 digest; the raw bearer token is never persisted.
    env.DB.prepare("INSERT INTO password_resets(id,user_id,token,expires_at,used) VALUES(?,?,?,?,0)").bind(uuid(), account.id, tokenHash, expiresAt)
  ]);
  resetPage.hash = "reset=" + encodeURIComponent(token);
  try {
    await sendResetEmail(env, account.email, resetPage.toString());
    await auditReset(env.DB, account.organization_id, account.id, "password_reset_requested", ip);
  } catch (error) {
    await env.DB.prepare("UPDATE password_resets SET used=1 WHERE token=? AND used=0").bind(tokenHash).run();
    const type = error && typeof error.name === "string" ? error.name : "UnknownError";
    console.error("NEXUS_PASSWORD_RESET_EMAIL_FAILED", { errorType: type });
  }
  return json({ success: true, message: GENERIC_RESET_MESSAGE });
}
export async function consumePasswordReset(request, env, ip = "unknown") {
  const body = await parseBody(request);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.newPassword === "string" ? body.newPassword : "";
  const tokenIsWellFormed = /^[A-Za-z0-9_-]{43}$/.test(token);
  const tokenHash = tokenIsWellFormed ? await sha256Hex(token) : "";
  const candidate = tokenIsWellFormed
    ? await env.DB.prepare("SELECT u.email FROM password_resets p JOIN users u ON u.id=p.user_id WHERE p.token=? AND p.used=0 AND p.expires_at>datetime('now') AND COALESCE(u.status,'active')='active'").bind(tokenHash).first()
    : null;
  const rateKey = typeof candidate?.email === "string" ? candidate.email.toLowerCase() : "invalid";
  if (await loginRateLimited(env.DB, ip, rateKey)) return json({ error: "Reset token is invalid or expired." }, 400);
  await recordAttempt(env.DB, ip, rateKey);
  if (!tokenIsWellFormed || password.length < 10 || password.length > 256) {
    return json({ error: "Reset token is invalid or expired, or the new password does not meet the requirements." }, 400);
  }
  const credentials = await hashPassword(password);
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,token_version=COALESCE(token_version,0)+1,updated_at=datetime('now') WHERE id=(SELECT user_id FROM password_resets WHERE token=? AND used=0 AND expires_at>datetime('now')) AND COALESCE(status,'active')='active'")
        .bind(credentials.hash, credentials.salt, tokenHash),
      env.DB.prepare("UPDATE password_resets SET used=1 WHERE token=? AND used=0 AND expires_at>datetime('now') AND EXISTS(SELECT 1 FROM users WHERE users.id=password_resets.user_id AND COALESCE(users.status,'active')='active')")
        .bind(tokenHash)
    ]);
  } catch { return json({ error: "Reset token is invalid or expired." }, 400); }
  const userChanged = Number(results?.[0]?.meta?.changes || 0);
  const tokenConsumed = Number(results?.[1]?.meta?.changes || 0);
  if (userChanged !== 1 || tokenConsumed !== 1) return json({ error: "Reset token is invalid or expired." }, 400);
  const account = await env.DB.prepare("SELECT u.id,u.organization_id FROM users u JOIN password_resets p ON p.user_id=u.id WHERE p.token=? AND p.used=1").bind(tokenHash).first();
  if (account) await auditReset(env.DB, account.organization_id, account.id, "password_reset_completed", ip);
  return json({ success: true, message: "Password updated. Please sign in again." });
}
