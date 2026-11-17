import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frontend = readFileSync(new URL("../../assets/js/app.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/production-worker.js", import.meta.url), "utf8");

const contracts = [
  ["/api/v1/dashboard/stats", "/api/dashboard/stats"],
  ["/api/v1/reports/summary", "/api/reports/summary"],
  ["/api/v1/tickets", "/api/tickets"],
  ["/api/v1/operations/payment-promises", "/api/operations/payment-promises"],
  ["/api/v1/financial/aging", "/api/financial/aging"],
  ["/api/v1/routers", "/api/routers"],
  ["/api/v1/network/devices", "/api/network/devices"],
  ["/api/v1/customers", "/api/customers"],
  ["/api/v1/packages", "/api/packages"],
  ["/api/v1/subscriptions", "/api/subscriptions"],
  ["/api/v1/invoices", "/api/invoices"],
  ["/api/v1/payments", "/api/payments"],
  ["/api/v1/staff", "/api/staff"],
];

for (const [frontendPath, workerPath] of contracts) {
  assert.ok(frontend.includes(frontendPath), `Frontend no longer declares ${frontendPath}; update this contract test deliberately.`);
  assert.ok(worker.includes(workerPath), `Hosted Worker no longer references ${workerPath}; review the frontend/Worker contract.`);
}

assert.match(worker, /url\.pathname\.replace\(/,
  "Worker must retain the /api/v1 URL-path normalization.");
assert.match(worker, /path==='\/api\/tickets'\|\|path\.startsWith\('\/api\/tickets\/'\)/,
  "Worker must keep the customer-facing tickets-to-complaints compatibility alias.");
assert.match(worker, /path==='\/api\/routers'\|\|path\.startsWith\('\/api\/routers\/'\)/,
  "Worker must keep the router inventory compatibility alias.");

console.log(`Hosted frontend/Worker static route contract passed (${contracts.length} route families).`);
