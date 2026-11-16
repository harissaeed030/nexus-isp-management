/**
 * Logical entities shared by local SQLite and hosted Cloudflare D1.
 * Physical table/column names are explicit because legacy schemas differ.
 * Never infer tenant identity from an incoming record.
 */
export const DATABASE_SCHEMA_VERSION = 1;
export const DATABASE_ENTITIES = Object.freeze({
  customers: {
    sqlite: { table: "customers", tenantColumn: "tenant_id", columns: ["customer_code","full_name","phone","email","address","status","updated_at","created_at"] },
    d1: { table: "customers", tenantColumn: "organization_id", columns: ["first_name","last_name","phone","email","address","status","customer_code","updated_at","created_at"] }
  },
  packages: {
    sqlite: { table: "packages", tenantColumn: "tenant_id", columns: ["name","speed_down_mbps","speed_up_mbps","monthly_price_pkr","status","updated_at","created_at"] },
    d1: { table: "packages", tenantColumn: "organization_id", archiveColumn: "is_active", archiveValue: 0, columns: ["name","speed_mbps","price","billing_cycle","is_active","updated_at","created_at","speed_down","speed_up"] }
  },
  subscriptions: {
    sqlite: { table: "subscriptions", tenantColumn: "tenant_id", columns: ["customer_id","package_id","status","started_at","expires_at","updated_at","created_at"] },
    d1: { table: "subscriptions", tenantColumn: "organization_id", columns: ["customer_id","package_id","status","start_date","end_date","updated_at","created_at"] }
  },
  invoices: {
    sqlite: { table: "invoices", tenantColumn: "tenant_id", columns: ["customer_id","invoice_number","amount_pkr","due_date","status","updated_at","created_at"] },
    d1: { table: "invoices", tenantColumn: "organization_id", columns: ["customer_id","subscription_id","invoice_number","amount","tax","total","status","issue_date","due_date","updated_at","created_at"] }
  },
  payments: {
    sqlite: { table: "payments", tenantColumn: "tenant_id", columns: ["invoice_id","amount_pkr","method","reference","received_at","created_at"] },
    d1: { table: "payments", tenantColumn: "organization_id", columns: ["invoice_id","customer_id","amount","payment_method","transaction_ref","status","paid_at","created_at"] }
  }
});

export function schemaFor(dialect) {
  if (dialect !== "sqlite" && dialect !== "d1") throw new TypeError("Dialect must be sqlite or d1.");
  return Object.fromEntries(Object.entries(DATABASE_ENTITIES).map(([name, definition]) => [name, definition[dialect]]));
}
