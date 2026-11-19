const READ_OPERATIONS = Object.freeze({
  "mikrotik.identity.read": Object.freeze({
    path: "/system/identity/print",
    fields: ["name"]
  }),
  "mikrotik.resource.read": Object.freeze({
    path: "/system/resource/print",
    fields: ["uptime", "version", "board-name", "cpu-load", "free-memory", "total-memory", "free-hdd-space", "total-hdd-space"]
  }),
  "mikrotik.interfaces.read": Object.freeze({
    path: "/interface/print",
    fields: [".id", "name", "type", "disabled", "running", "mac-address", "mtu"]
  }),
  "mikrotik.pppoe.sessions.read": Object.freeze({
    path: "/ppp/active/print",
    fields: [".id", "name", "service", "caller-id", "address", "uptime", "encoding"]
  }),
  "mikrotik.pppoe.secrets.read": Object.freeze({
    path: "/ppp/secret/print",
    fields: [".id", "name", "service", "profile", "disabled", "comment"]
  }),
  "mikrotik.pppoe.profiles.read": Object.freeze({
    path: "/ppp/profile/print",
    fields: [".id", "name", "rate-limit", "local-address", "remote-address"]
  })
});

export class MikroTikReadOnlyAdapter {
  constructor(api) {
    if (!api || typeof api.command !== "function") {
      throw new TypeError("A connected RouterOS API client is required.");
    }
    this.api = api;
  }

  capabilities() {
    return Object.keys(READ_OPERATIONS);
  }

  async read(capability) {
    const operation = READ_OPERATIONS[capability];
    if (!operation) {
      const error = new Error("Unsupported or non-read-only MikroTik capability.");
      error.code = "MIKROTIK_READ_CAPABILITY_UNAVAILABLE";
      throw error;
    }
    const rows = await this.api.command(operation.path, {
      ".proplist": operation.fields.join(",")
    });
    if (!Array.isArray(rows)) {
      throw new Error("RouterOS returned an invalid read response.");
    }
    const allowed = new Set(operation.fields);
    return rows.map(row => Object.fromEntries(
      Object.entries(row || {}).filter(([key]) => allowed.has(key))
    ));
  }
}

export const MIKROTIK_READ_CAPABILITIES = Object.freeze(Object.keys(READ_OPERATIONS));
