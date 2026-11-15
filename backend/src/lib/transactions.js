/**
 * Run synchronous SQLite work in one atomic write transaction.
 * BEGIN IMMEDIATE acquires the write reservation before reading mutable balances,
 * preventing concurrent writers from making decisions from stale state.
 */
export function withTransaction(db, work) {
  if (typeof work !== "function") throw new TypeError("Transaction work must be a function.");
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    if (result && typeof result.then === "function") {
      throw new TypeError("SQLite transaction callbacks must be synchronous.");
    }
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve the original failure */ }
    throw error;
  }
}
