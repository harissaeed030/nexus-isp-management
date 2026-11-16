const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const assertIdentifier = value => {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new TypeError("Unsafe SQL identifier.");
  return value;
};
const placeholders = count => Array.from({ length: count }, () => "?").join(",");

/**
 * Tenant-scoped repository over the shared SQLite/D1 adapter contract.
 * Entity definitions deliberately describe each runtime's physical schema;
 * SQL values are always bound parameters and identifiers are allow-listed.
 */
export function createTenantRepository(adapter, definitions) {
  if (!adapter || !["sqlite", "d1"].includes(adapter.dialect)) throw new TypeError("Unsupported database adapter.");
  const definition = entity => {
    const value = definitions[entity];
    if (!value) throw new TypeError(`Unknown repository entity: ${entity}`);
    return {
      table: assertIdentifier(value.table),
      tenantColumn: assertIdentifier(value.tenantColumn || (adapter.dialect === "sqlite" ? "tenant_id" : "organization_id")),
      idColumn: assertIdentifier(value.idColumn || "id"),
      columns: value.columns,
      archiveColumn: value.archiveColumn ? assertIdentifier(value.archiveColumn) : "status",
      archiveValue: value.archiveValue
    };
  };
  const columnsFor = (def, fields) => {
    const allowed = new Set(def.columns);
    const entries = Object.entries(fields || {});
    if (!entries.length) throw new TypeError("At least one field is required.");
    for (const [key] of entries) {
      assertIdentifier(key);
      if (!allowed.has(key) || key === def.idColumn || key === def.tenantColumn) throw new TypeError(`Field is not writable: ${key}`);
    }
    return entries;
  };
  return Object.freeze({
    dialect: adapter.dialect,
    async get(entity, tenantId, id) {
      if (!tenantId || !id) throw new TypeError("Tenant ID and record ID are required.");
      const d = definition(entity);
      return adapter.first(`SELECT * FROM ${d.table} WHERE ${d.idColumn}=? AND ${d.tenantColumn}=? LIMIT 1`, [id, tenantId]);
    },
    async list(entity, tenantId, { limit = 100, offset = 0, orderBy = "created_at", direction = "DESC" } = {}) {
      if (!tenantId) throw new TypeError("Tenant ID is required.");
      const d = definition(entity);
      const order = assertIdentifier(orderBy);
      if (!d.columns.includes(order) && order !== d.idColumn) throw new TypeError("Unsupported sort column.");
      if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0) throw new RangeError("Invalid pagination.");
      const sort = String(direction).toUpperCase() === "ASC" ? "ASC" : "DESC";
      return adapter.all(`SELECT * FROM ${d.table} WHERE ${d.tenantColumn}=? ORDER BY ${order} ${sort} LIMIT ? OFFSET ?`, [tenantId, limit, offset]);
    },
    async create(entity, tenantId, fields, id = globalThis.crypto.randomUUID()) {
      if (!tenantId) throw new TypeError("Tenant ID is required.");
      const d = definition(entity), entries = columnsFor(d, fields);
      const keys = [d.idColumn, d.tenantColumn, ...entries.map(([key]) => key)];
      const values = [id, tenantId, ...entries.map(([, value]) => value)];
      const result = await adapter.run(`INSERT INTO ${d.table} (${keys.join(",")}) VALUES (${placeholders(keys.length)})`, values);
      return { id, ...result };
    },
    async update(entity, tenantId, id, fields, { expectedUpdatedAt } = {}) {
      if (!tenantId || !id) throw new TypeError("Tenant ID and record ID are required.");
      const d = definition(entity), entries = columnsFor(d, fields);
      const assignments = entries.map(([key]) => `${key}=?`).join(",");
      const params = [...entries.map(([, value]) => value), id, tenantId];
      let guard = "";
      if (expectedUpdatedAt !== undefined) {
        if (!d.columns.includes("updated_at")) throw new TypeError("Optimistic concurrency is not supported for this entity.");
        guard = " AND updated_at=?";
        params.push(expectedUpdatedAt);
      }
      const result = await adapter.run(`UPDATE ${d.table} SET ${assignments} WHERE ${d.idColumn}=? AND ${d.tenantColumn}=?${guard}`, params);
      return { ...result, conflict: expectedUpdatedAt !== undefined && result.changes === 0 };
    },
    async archive(entity, tenantId, id, status = "inactive") {
      const d = definition(entity);
      if (!d.columns.includes(d.archiveColumn)) throw new TypeError("Entity does not support safe archival.");
      const value = d.archiveValue === status ? status : (d.archiveValue ?? status);
      return adapter.run(`UPDATE ${d.table} SET ${d.archiveColumn}=? WHERE ${d.idColumn}=? AND ${d.tenantColumn}=?`, [value, id, tenantId]);
    },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.some(item => !item || typeof item.sql !== "string" || !Array.isArray(item.params || []))) throw new TypeError("Invalid SQL batch.");
      return adapter.batch(statements);
    }
  });
}
