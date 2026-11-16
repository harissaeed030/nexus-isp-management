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
function rejectSecrets(value, path = "payload") {
  if (Array.isArray(value)) return value.forEach((v, i) => rejectSecrets(v, path + "[" + i + "]"));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.test(key)) throw new TypeError("Sensitive field is not syncable: " + path + "." + key);
    rejectSecrets(child, path + "." + key);
  }
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
  return Object.freeze({contractVersion:CONTRACT_VERSION,operationId,tenantId,entity,entityId,operation,payload:input.payload});
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
      return {...root,customer_code:requiredString(local.customer_code,"customer_code"),first_name,last_name:parts.join(" "),phone:local.phone??null,email:local.email??null,address:local.address??null,status:local.status??"active"};
    }
    case "package":
      return {...root,name:requiredString(local.name,"name"),speed_down:safeInteger(local.speed_down_mbps,"speed_down_mbps",1),speed_up:safeInteger(local.speed_up_mbps,"speed_up_mbps",1),speed_mbps:safeInteger(local.speed_down_mbps,"speed_down_mbps",1),price:safeInteger(local.monthly_price_pkr,"monthly_price_pkr"),billing_cycle:"monthly",is_active:(local.status??"active")==="active"?1:0};
    case "subscription":
      return {...root,customer_id:requiredString(local.customer_id,"customer_id"),package_id:requiredString(local.package_id,"package_id"),status:requiredString(local.status??"active","status"),start_date:local.started_at??local.start_date??null,end_date:local.end_date??null};
    case "invoice":
      return {...root,customer_id:requiredString(local.customer_id,"customer_id"),invoice_number:requiredString(local.invoice_number,"invoice_number"),amount:safeInteger(local.amount_pkr,"amount_pkr"),tax:0,total:safeInteger(local.amount_pkr,"amount_pkr"),issue_date:local.issue_date??local.created_at??null,due_date:local.due_date??null,billing_period:local.billing_period??null,status:requiredString(local.status??"unpaid","status")};
    case "payment":
      return {...root,invoice_id:requiredString(local.invoice_id,"invoice_id"),customer_id:requiredString(local.customer_id,"customer_id"),amount:safeInteger(local.amount_pkr,"amount_pkr",1),payment_method:requiredString(local.method,"method"),transaction_ref:local.reference??null,status:"completed",paid_at:local.received_at??null};
    default: throw new TypeError("entity is not syncable");
  }
}
export function createOperation({operationId,tenantId,entity,record,organizationId,operation="upsert"}) {
  const mapped=mapLocalRecord(entity,record,organizationId);
  return validateOperation({contractVersion:CONTRACT_VERSION,operationId,tenantId,entity,entityId:record.id,operation,payload:mapped});
}
