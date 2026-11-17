export const NETWORK_READ_CAPABILITIES = Object.freeze(new Set([
  "mikrotik.identity.read",
  "mikrotik.resource.read",
  "mikrotik.interfaces.read",
  "mikrotik.pppoe.sessions.read"
]));

const SECRET_KEY = /(password|passphrase|secret|token|community|string|private.?key|authorization|credential|api.?key|psk)/i;

export function validateNetworkConnectorName(value) {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 80;
}

export function isNetworkConnectorToken(value) {
  return typeof value === "string" && /^nxc_[A-Za-z0-9_-]{40,80}$/.test(value);
}

export function validateNetworkJobRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Network job request must be an object.");
  }
  const connectorId = typeof input.connector_id === "string" ? input.connector_id.trim() : "";
  const deviceId = typeof input.device_id === "string" ? input.device_id.trim() : "";
  const capability = typeof input.capability === "string" ? input.capability.trim() : "";
  const idempotencyKey = typeof input.idempotency_key === "string" ? input.idempotency_key.trim() : "";
  if (!connectorId || !deviceId || !NETWORK_READ_CAPABILITIES.has(capability) ||
      !/^[A-Za-z0-9._-]{8,128}$/.test(idempotencyKey)) {
    throw new TypeError("Connector, MikroTik device, supported read capability and 8-128 character idempotency_key are required.");
  }
  return Object.freeze({ connectorId, deviceId, capability, idempotencyKey });
}

export function redactNetworkResult(value, depth = 0) {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactNetworkResult(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 2000) : value;
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactNetworkResult(item, depth + 1);
  }
  return out;
}
