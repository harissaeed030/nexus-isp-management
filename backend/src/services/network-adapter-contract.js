export const NETWORK_ADAPTER_CONTRACT_VERSION = "1.0.0";

const REQUIRED_TEXT_FIELDS = [
  "organizationId",
  "deviceId",
  "requestId",
  "requestedBy",
  "operation",
  "capability"
];

const SECRET_KEY = /(password|passphrase|secret|token|community|string|private.?key|authorization|credential|api.?key|psk)/i;

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new TypeError(`Invalid network adapter field: ${field}`);
  }
  return value.trim();
}

export function validateAdapterRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Network adapter request must be an object.");
  }
  if (request.contractVersion !== NETWORK_ADAPTER_CONTRACT_VERSION) {
    throw new TypeError("Unsupported network adapter contract version.");
  }
  const normalized = {};
  for (const field of REQUIRED_TEXT_FIELDS) {
    normalized[field] = requiredText(request[field], field);
  }
  if (!/^[a-z][a-z0-9_.-]{1,100}$/.test(normalized.operation)) {
    throw new TypeError("Invalid network adapter operation.");
  }
  if (!/^[a-z][a-z0-9_.-]{1,100}$/.test(normalized.capability)) {
    throw new TypeError("Invalid network adapter capability.");
  }
  return Object.freeze(normalized);
}

export function assertTenantOwnership(resourceOrganizationId, requestOrganizationId) {
  if (!resourceOrganizationId || !requestOrganizationId ||
      resourceOrganizationId !== requestOrganizationId) {
    const error = new Error("Network device is not available in this organization.");
    error.code = "NETWORK_TENANT_MISMATCH";
    throw error;
  }
  return true;
}

export function assertReadOnlyCapability(capabilities, capability) {
  if (!capability.endsWith(".read") || !capabilities ||
      capabilities[capability] !== true) {
    const error = new Error("Requested read-only network capability is unavailable.");
    error.code = "NETWORK_CAPABILITY_UNAVAILABLE";
    throw error;
  }
  return true;
}

/**
 * Creates metadata for a read-only dry-run. This function never receives a
 * socket/client and never executes a vendor command.
 */
export function createReadOnlyPlan(request, capabilities) {
  const normalized = validateAdapterRequest(request);
  assertReadOnlyCapability(capabilities, normalized.capability);
  return Object.freeze({
    contractVersion: NETWORK_ADAPTER_CONTRACT_VERSION,
    organizationId: normalized.organizationId,
    deviceId: normalized.deviceId,
    requestId: normalized.requestId,
    requestedBy: normalized.requestedBy,
    operation: normalized.operation,
    capability: normalized.capability,
    status: "planned",
    executionAllowed: false,
    mode: "read-only",
    createdAt: new Date().toISOString()
  });
}

export function redactNetworkSecrets(value) {
  if (Array.isArray(value)) return value.map(redactNetworkSecrets);
  if (!value || typeof value !== "object") return value;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    safe[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactNetworkSecrets(item);
  }
  return safe;
}
