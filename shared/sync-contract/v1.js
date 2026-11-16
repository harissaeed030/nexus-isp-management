// NEXUS SQLite -> D1 contract v1. Pure mapping/validation; transport is intentionally separate.
export const CONTRACT_VERSION = 1;
export const SYNCABLE_ENTITIES = Object.freeze(["customer","package","subscription","invoice","payment"]);
const SECRET_KEYS = /password|token|secret|credential|private.?key|acs|pppoe/i;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const requiredString = (value, name) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(name + " must be a non-empty string");
  return value.trim();
};
const safeInteger = (value, name, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) throw new TypeError(name + " must be a safe integer >= " + min);
  return value;
};
function rejectSecrets(value, path = "payload", seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite number is not syncable: " + path);
    return;
  }
  if (typeof value !== "object") throw new TypeError("Non-JSON value is not syncable: " + path);
  if (seen.has(value)) throw new TypeError("Circular payload is not syncable: " + path);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((v, i) => rejectSecrets(v, path + "[" + i + "]", seen));
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError("Non-plain object is not syncable: " + path);
    }
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEYS.test(key)) throw new TypeError("Sensitive field is not syncable: " + path + "." + key);
      rejectSecrets(child, path + "." + key, seen);
    }
  }
  seen.delete(value);
}
export function validateOperation(input) {
  if (!isObject(input)) throw new TypeError("operation must be an object");
  const operationId = requiredString(input.operationId, "operationId");
  const tenantId = requiredString(input.tenantId, "tenantId");
  const entity = requiredString(input.entity, "entity");
  if (!SYNCABLE_ENTITIES.includes(entity)) throw new TypeError("entity is not syncable");
  const entityId = requiredString(input.entityId, "entityId");
  const operation = input.operation;
  if (!["upsert", "create"].includes(operation)) throw new TypeError("operation must be create or upsert");
  if (input.contractVersion !== CONTRACT_VERSION) throw new TypeError("unsupported contractVersion");
  if (!isObject(input.payload)) throw new TypeError("payload must be an object");
  rejectSecrets(input.payload);
  if (requiredString(input.payload.id, "payload.id") !== entityId) {
    throw new TypeError("payload.id must match entityId");
  }
  requiredString(input.payload.organization_id, "payload.organization_id");
  return Object.freeze({
    contractVersion: CONTRACT_VERSION, operationId, tenantId, entity, entityId, operation,
    payload: Object.freeze(structuredClone(input.payload))
  });
}
function base(local, tenantId) {
  return {id:requiredString(local.id,"id"),organization_id:requiredString(tenantId,"organizationId")};
}
export function mapLocalRecord(entity, local, organizationId) {
  if (!isObject(local)) throw new TypeError("local record must be an object");
  const tenantId = requiredString(organizationId,"organizationId");
  const id = requiredString(local.id,"id");
  if (local.tenant_id !== undefined && local.tenant_id !== null && local.tenant_id !== "") {
    requiredString(local.tenant_id,"tenant_id");
  }
  const root = base(local,tenantId);
  switch(entity) {
    case "customer": {
      const fullName=requiredString(local.full_name,"full_name");
      const parts=fullName.split(/\s+/);
      const first_name=parts.shift();
      const customerStatus = {active:"active",inactive:"suspended",blocked:"terminated",suspended:"suspended",terminated:"terminated"}[local.status??"active"];
      if (!customerStatus) throw new TypeError("unsupported customer status");
      return {...root,customer_code:requiredString(local.customer_code,"customer_code"),first_name,last_name:parts.join(" "),phone:local.phone??null,email:local.email??null,address:local.address??null,status:customerStatus};
    }
    case "package":
      return {...root,name:requiredString(local.name,"name"),speed_down:safeInteger(local.speed_down_mbps,"speed_down_mbps",1),speed_up:safeInteger(local.speed_up_mbps,"speed_up_mbps",1),speed_mbps:safeInteger(local.speed_down_mbps,"speed_down_mbps",1),price:safeInteger(local.monthly_price_pkr,"monthly_price_pkr"),billing_cycle:"monthly",is_active:(local.status??"active")==="active"?1:0};
    case "subscription": {
      const status = requiredString(local.status ?? "active", "status");
      if (!["active","suspended","cancelled","expired"].includes(status)) throw new TypeError("unsupported subscription status");
      return {...root,customer_id:requiredString(local.customer_id,"customer_id"),package_id:requiredString(local.package_id,"package_id"),status,start_date:requiredString(local.started_at??local.start_date,"started_at"),end_date:local.end_date??null};
    }
    case "invoice": {
      const localStatus = requiredString(local.status ?? "unpaid", "status");
      const statusMap = {unpaid:"pending",partial:"pending",pending:"pending",paid:"paid",overdue:"overdue",cancelled:"cancelled"};
      if (!statusMap[localStatus]) throw new TypeError("unsupported invoice status");
      const amount = safeInteger(local.amount_pkr,"amount_pkr");
      return {...root,customer_id:requiredString(local.customer_id,"customer_id"),invoice_number:requiredString(local.invoice_number,"invoice_number"),amount,tax:0,total:amount,issue_date:requiredString(local.issue_date??local.created_at,"issue_date"),due_date:requiredString(local.due_date,"due_date"),billing_period:local.billing_period??null,status:statusMap[localStatus]};
    }
    case "payment":
      const localMethod = requiredString(local.method,"method");
      const paymentMethod = {cash:"cash",bank:"bank_transfer",bank_transfer:"bank_transfer",card:"card",jazzcash:"mobile_money",easypaisa:"mobile_money",mobile_money:"mobile_money",other:"other"}[localMethod];
      if (!paymentMethod) throw new TypeError("unsupported payment method");
      return {...root,invoice_id:requiredString(local.invoice_id,"invoice_id"),customer_id:requiredString(local.customer_id,"customer_id"),amount:safeInteger(local.amount_pkr,"amount_pkr",1),payment_method:paymentMethod,transaction_ref:local.reference??null,status:"completed",paid_at:local.received_at??null};
    default: throw new TypeError("entity is not syncable");
  }
}
export function createOperation({operationId,tenantId,entity,record,organizationId,operation="upsert"}) {
  const localTenantId = requiredString(record?.tenant_id, "record.tenant_id");
  if (localTenantId !== requiredString(tenantId, "tenantId")) {
    throw new TypeError("record tenant_id must match tenantId");
  }
  const mapped=mapLocalRecord(entity,record,organizationId);
  return validateOperation({contractVersion:CONTRACT_VERSION,operationId,tenantId,entity,entityId:record.id,operation,payload:mapped});
}
