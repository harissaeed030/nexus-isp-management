import { timingSafeEqual } from "node:crypto";

const PROTECTED_NETWORK_WRITES = [
  { method: "POST", pattern: /^\/api\/v1\/routers\/[^/]+\/pppoe\/secrets$/ },
  { method: "PATCH", pattern: /^\/api\/v1\/routers\/[^/]+\/pppoe\/secrets\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/v1\/routers\/[^/]+\/pppoe\/secrets\/[^/]+\/(?:suspend|restore)$/ },
  { method: "POST", pattern: /^\/api\/v1\/tr069\/devices\/[^/]+\/(?:diagnostics|reboot|wifi)$/ }
];

export function requiresNetworkWriteApproval(method, path) {
  const verb = String(method || "GET").toUpperCase();
  const pathname = String(path || "").split("?")[0];
  return PROTECTED_NETWORK_WRITES.some(route =>
    route.method === verb && route.pattern.test(pathname)
  );
}

export function isNetworkWriteApproved({
  enabled,
  approvalToken,
  suppliedToken
}) {
  if (enabled !== true || typeof approvalToken !== "string" ||
      approvalToken.length < 32 || typeof suppliedToken !== "string" ||
      suppliedToken.length !== approvalToken.length) return false;
  return timingSafeEqual(Buffer.from(approvalToken), Buffer.from(suppliedToken));
}

export function networkWriteGuard(req, res, next) {
  if (!requiresNetworkWriteApproval(req.method, req.path)) return next();

  const enabled = process.env.NEXUS_NETWORK_WRITE_ENABLED === "true";
  const approvalToken = process.env.NEXUS_NETWORK_WRITE_APPROVAL_TOKEN || "";
  const suppliedToken = req.get("x-nexus-network-approval") || "";

  if (!isNetworkWriteApproved({ enabled, approvalToken, suppliedToken })) {
    return res.status(423).json({
      success: false,
      error: "Network write actions are locked. Enable them only after lab verification and explicit operator approval."
    });
  }
  return next();
}
