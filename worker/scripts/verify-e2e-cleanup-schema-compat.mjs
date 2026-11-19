import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const staging = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const production = await readFile(new URL("../src/production-worker.js", import.meta.url), "utf8");
const start = staging.indexOf("if(path==='/api/e2e/tenant'&&m==='DELETE')");
const end = staging.indexOf("\nif(!await roleAll", start);
assert.ok(start >= 0 && end > start, "staging-only tenant cleanup route must exist");
const cleanup = staging.slice(start, end);

assert.match(
  cleanup,
  /SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='payment_promises'/,
  "cleanup must detect whether the optional payment_promises migration exists",
);
assert.match(
  cleanup,
  /if\(paymentPromisesTable\)statements\.splice\(3,0,env\.DB\.prepare\('DELETE FROM payment_promises WHERE organization_id=\?'\)\.bind\(orgId\)\)/,
  "cleanup may delete payment promises only when the table exists",
);
assert.doesNotMatch(
  production,
  /\/api\/e2e\/tenant/,
  "destructive E2E tenant teardown must remain absent from the production Worker",
);

console.log("Staging E2E cleanup schema-compatibility guard passed; production Worker remains free of teardown route.");
