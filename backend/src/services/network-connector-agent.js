import "dotenv/config";
import { db } from "../config/database.js";
import { credentialCrypto } from "../routes/mikrotik.routes.js";
import { createMikroTikAdapter } from "./mikrotik-api.js";
import { MikroTikReadOnlyAdapter } from "./mikrotik-readonly-adapter.js";

const TOKEN_PATTERN = /^nxc_[A-Za-z0-9_-]{40,80}$/;
const READ_CAPABILITIES = new Set([
  "mikrotik.identity.read",
  "mikrotik.resource.read",
  "mikrotik.interfaces.read",
  "mikrotik.pppoe.sessions.read"
]);

function validateApiBase(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("NETWORK_CONNECTOR_API_URL must be an HTTPS base URL without credentials, query or hash.");
  }
  return url.toString().replace(/\/$/, "");
}

function validateDeviceMap(value) {
  const parsed = JSON.parse(value || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("NETWORK_CONNECTOR_DEVICE_MAP_JSON must be an object mapping hosted device IDs to local router IDs.");
  }
  for (const [hostedId, localId] of Object.entries(parsed)) {
    if (!hostedId || typeof localId !== "string" || !localId.trim()) {
      throw new Error("Every network device map entry must contain a hosted device ID and local router ID.");
    }
  }
  return Object.freeze({ ...parsed });
}

export class NetworkConnectorAgent {
  constructor({
    apiBaseUrl,
    token,
    deviceMap,
    loadRouter,
    createApi = createMikroTikAdapter,
    fetchImpl = fetch,
    pollIntervalMs = 5000
  }) {
    this.apiBaseUrl = validateApiBase(apiBaseUrl);
    if (!TOKEN_PATTERN.test(token || "")) throw new Error("NETWORK_CONNECTOR_TOKEN is missing or invalid.");
    if (!deviceMap || typeof deviceMap !== "object" || Array.isArray(deviceMap)) {
      throw new TypeError("A hosted-to-local device map is required.");
    }
    if (typeof loadRouter !== "function") throw new TypeError("A local router loader is required.");
    this.token = token;
    this.deviceMap = deviceMap;
    this.loadRouter = loadRouter;
    this.createApi = createApi;
    this.fetchImpl = fetchImpl;
    this.pollIntervalMs = Math.max(1000, Math.min(Number(pollIntervalMs) || 5000, 60000));
    this.stopped = false;
  }

  async request(path, options = {}) {
    const response = await this.fetchImpl(this.apiBaseUrl + path, {
      ...options,
      headers: {
        Authorization: "Connector " + this.token,
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Network connector API request failed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async executeReadJob(job) {
    if (!job || typeof job.id !== "string" || typeof job.device_id !== "string" ||
        !READ_CAPABILITIES.has(job.capability)) {
      throw new Error("Unsupported or malformed read-only network job.");
    }
    const localRouterId = this.deviceMap[job.device_id];
    if (!localRouterId) throw new Error("Hosted device is not mapped to a local router.");
    const router = await this.loadRouter(localRouterId);
    if (!router) throw new Error("Mapped local router was not found.");
    if (Number(router.api_port) === 8728) {
      throw new Error("Plaintext RouterOS API is disabled. Configure RouterOS API over TLS.");
    }

    const api = this.createApi({
      host: router.host,
      port: Number(router.api_port) || 8729,
      username: credentialCrypto.decrypt(router.credential_username),
      password: credentialCrypto.decrypt(router.credential_password),
      timeout: 8000,
      tlsOptions: { rejectUnauthorized: true }
    });
    try {
      await api.connect();
      return await new MikroTikReadOnlyAdapter(api).read(job.capability);
    } finally {
      api.close();
    }
  }

  async report(jobId, status, result, errorCode = null) {
    return this.request("/api/v1/network/agent/jobs/" + encodeURIComponent(jobId) + "/result", {
      method: "POST",
      body: JSON.stringify({ status, result, error_code: errorCode })
    });
  }

  async pollOnce() {
    const response = await this.request("/api/v1/network/agent/jobs/next");
    if (!response.job) return false;
    const job = response.job;
    try {
      const data = await this.executeReadJob(job);
      await this.report(job.id, "completed", { data });
    } catch (error) {
      const code = error?.status === 401 ? "CONNECTOR_AUTH_FAILED" :
        String(error?.message || "").includes("mapped") ? "DEVICE_MAPPING_ERROR" :
        String(error?.message || "").includes("Plaintext") ? "INSECURE_ROUTER_TRANSPORT" :
        "READ_OPERATION_FAILED";
      await this.report(job.id, "failed", {}, code);
    }
    return true;
  }

  stop() { this.stopped = true; }

  async run() {
    while (!this.stopped) {
      try {
        const found = await this.pollOnce();
        if (!found) await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
      } catch (error) {
        const status = error?.status || 0;
        console.error("NEXUS_CONNECTOR_POLL_FAILED", {
          status,
          message: String(error?.message || "Unknown error").slice(0, 160)
        });
        if (status === 401 || status === 403) throw error;
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }
}

export function createLocalConnectorAgent(env = process.env) {
  if (!env.NETWORK_CONNECTOR_LOCAL_TENANT_ID) {
    throw new Error("NETWORK_CONNECTOR_LOCAL_TENANT_ID is required.");
  }
  const deviceMap = validateDeviceMap(env.NETWORK_CONNECTOR_DEVICE_MAP_JSON);
  return new NetworkConnectorAgent({
    apiBaseUrl: env.NETWORK_CONNECTOR_API_URL,
    token: env.NETWORK_CONNECTOR_TOKEN,
    deviceMap,
    loadRouter: localRouterId => db.prepare(
      "SELECT * FROM routers WHERE id=? AND tenant_id=?"
    ).get(localRouterId, env.NETWORK_CONNECTOR_LOCAL_TENANT_ID)
  });
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const agent = createLocalConnectorAgent();
  process.on("SIGINT", () => agent.stop());
  process.on("SIGTERM", () => agent.stop());
  agent.run().catch(error => {
    console.error("NEXUS_CONNECTOR_STOPPED", {
      message: String(error?.message || "Unknown error").slice(0, 200)
    });
    process.exitCode = 1;
  });
}
