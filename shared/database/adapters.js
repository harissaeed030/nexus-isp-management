/**
 * Shared asynchronous SQL adapter contract for SQLite and Cloudflare D1.
 * Both adapters accept SQLite-compatible positional ? placeholders.
 */
export function createSqliteAdapter(database) {
  if (!database?.prepare) throw new TypeError("A node:sqlite DatabaseSync connection is required.");
  return Object.freeze({
    dialect: "sqlite",
    async first(sql, params = []) { return database.prepare(sql).get(...params) ?? null; },
    async all(sql, params = []) { return database.prepare(sql).all(...params); },
    async run(sql, params = []) {
      const result = database.prepare(sql).run(...params);
      return { changes: Number(result.changes ?? 0), lastInsertRowid: result.lastInsertRowid ?? null };
    },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.length === 0) return [];
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, params = [] }) => {
          const result = database.prepare(sql).run(...params);
          return { changes: Number(result.changes ?? 0), lastInsertRowid: result.lastInsertRowid ?? null };
        });
        database.exec("COMMIT");
        return results;
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch { /* preserve original failure */ }
        throw error;
      }
    },
    async close() { database.close(); }
  });
}

export function createD1Adapter(binding) {
  if (!binding?.prepare || !binding?.batch) throw new TypeError("A Cloudflare D1 database binding is required.");
  const prepare = (sql, params = []) => binding.prepare(sql).bind(...params);
  return Object.freeze({
    dialect: "d1",
    async first(sql, params = []) { return await prepare(sql, params).first() ?? null; },
    async all(sql, params = []) {
      const result = await prepare(sql, params).all();
      if (!result.success) throw new Error("D1 query failed.");
      return result.results ?? [];
    },
    async run(sql, params = []) {
      const result = await prepare(sql, params).run();
      if (!result.success) throw new Error("D1 statement failed.");
      return { changes: Number(result.meta?.changes ?? 0), lastInsertRowid: result.meta?.last_row_id ?? null };
    },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.length === 0) return [];
      const results = await binding.batch(statements.map(({ sql, params = [] }) => prepare(sql, params)));
      return results.map(result => {
        if (!result.success) throw new Error("D1 batch failed.");
        return { changes: Number(result.meta?.changes ?? 0), lastInsertRowid: result.meta?.last_row_id ?? null };
      });
    },
    async close() { /* D1 bindings are managed by the Workers runtime. */ }
  });
}
