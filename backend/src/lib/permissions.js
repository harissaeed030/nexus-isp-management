export const PERMISSIONS = [
  { key: "dashboard.read", group: "Dashboard", label: "View dashboard" },
  { key: "customers.read", group: "Customers", label: "View customers" },
  { key: "customers.create", group: "Customers", label: "Add customers" },
  { key: "customers.update", group: "Customers", label: "Edit customers" },
  { key: "customers.delete", group: "Customers", label: "Delete customers" },
  { key: "packages.read", group: "Packages", label: "View packages" },
  { key: "packages.manage", group: "Packages", label: "Create and edit packages" },
  { key: "subscriptions.read", group: "Subscriptions", label: "View subscriptions" },
  { key: "subscriptions.manage", group: "Subscriptions", label: "Create and change subscriptions" },
  { key: "billing.read", group: "Billing", label: "View invoices and payments" },
  { key: "invoices.create", group: "Billing", label: "Create invoices" },
  { key: "payments.create", group: "Billing", label: "Record payments" },
  { key: "billing.generate", group: "Billing", label: "Generate monthly invoices" },
  { key: "reports.read", group: "Reports", label: "View financial reports" },
  { key: "tickets.read", group: "Support", label: "View complaints" },
  { key: "tickets.manage", group: "Support", label: "Create and update complaints" },
  { key: "routers.read", group: "Network", label: "View router inventory" },
  { key: "routers.manage", group: "Network", label: "Add, edit and delete router records" },
  { key: "routers.provision", group: "Network", label: "Manage PPPoE users and connections" },
  { key: "olts.read", group: "Network", label: "View OLT and ONU inventory" },
  { key: "olts.manage", group: "Network", label: "Manage OLT and ONU records" },
  { key: "audit.read", group: "Administration", label: "View activity log" },
  { key: "areas.read", group: "Coverage", label: "View coverage areas" },{ key: "areas.manage", group: "Coverage", label: "Manage coverage areas" },
  { key: "locations.read", group: "Coverage", label: "View geographic locations" },{ key: "locations.manage", group: "Coverage", label: "Manage geographic locations" },
  { key: "applications.read", group: "Applications", label: "View connection applications" },{ key: "applications.manage", group: "Applications", label: "Manage connection applications" },
  { key: "field.read", group: "Field operations", label: "View technician assignments" },{ key: "field.manage", group: "Field operations", label: "Assign field technicians" },
  { key: "partners.read", group: "Partners", label: "View dealers and sub-dealers" },{ key: "partners.manage", group: "Partners", label: "Manage dealers and sub-dealers" },
  { key: "recovery.read", group: "Collections", label: "View recovery officers" },{ key: "recovery.manage", group: "Collections", label: "Manage recovery officers" },
  { key: "collections.read", group: "Collections", label: "View and reconcile collections" },{ key: "collections.manage", group: "Collections", label: "Record cash collections" },
  { key: "inventory.read", group: "Inventory", label: "View stock" },{ key: "inventory.manage", group: "Inventory", label: "Manage stock movements" },
  { key: "notifications.read", group: "Communication", label: "View customer notifications" },{ key: "notifications.manage", group: "Communication", label: "Queue customer notifications" },
  { key: "ledger.read", group: "Finance", label: "View customer ledgers" }
];
export const permissionKeys = new Set(PERMISSIONS.map(item => item.key));
export const ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: ["*"],
  billing: ["dashboard.read","customers.read","packages.read","subscriptions.read","billing.read","invoices.create","payments.create","billing.generate","reports.read"],
  noc: ["dashboard.read","customers.read","packages.read","subscriptions.read","subscriptions.manage","tickets.read","tickets.manage","routers.read","routers.manage","routers.provision","olts.read","olts.manage"],
  support: ["dashboard.read","customers.read","packages.read","subscriptions.read","tickets.read","tickets.manage"],
  technician: ["dashboard.read","customers.read","subscriptions.read","tickets.read","tickets.manage","routers.read","olts.read"],
  staff: ["dashboard.read"]
};
export function roleHasPermission(role, permission) {
  const allowed=ROLE_PERMISSIONS[role]||[];
  return allowed.includes("*")||allowed.includes(permission);
}
export function hasPermission(db,user,permission) {
  if(!permission)return false;
  if(user.role==="owner")return true;
  const override=db.prepare("SELECT allowed FROM user_permissions WHERE tenant_id=? AND user_id=? AND permission=?").get(user.tenant_id,user.id,permission);
  return override?Number(override.allowed)===1:roleHasPermission(user.role,permission);
}
export function getEffectivePermissions(db,user) {
  const overrides=new Map(db.prepare("SELECT permission,allowed FROM user_permissions WHERE tenant_id=? AND user_id=?").all(user.tenant_id,user.id).map(row=>[row.permission,Number(row.allowed)===1]));
  return PERMISSIONS.map(item=>{
    const defaultAllowed=roleHasPermission(user.role,item.key),overridden=overrides.has(item.key);
    return {...item,defaultAllowed,allowed:overridden?overrides.get(item.key):defaultAllowed,overridden};
  });
}
export function permissionFor(path,method) {
  const verb=String(method||"GET").toUpperCase();
  const matches=base=>path===base||path.startsWith(base+"/");
  if(path==="/api/v1/dashboard")return verb==="GET"?"dashboard.read":null;
  const business=[["/api/v1/coverage-areas","areas"],["/api/v1/locations","locations"],["/api/v1/applications","applications"],["/api/v1/field-assignments","field"],["/api/v1/partners","partners"],["/api/v1/recovery-officers","recovery"],["/api/v1/cash-collections","collections"],["/api/v1/operator-collections","collections"],["/api/v1/inventory","inventory"],["/api/v1/notifications","notifications"]];
  for(const [base,key] of business){if(path===base||path.startsWith(base+"/")){if(key==="ledger")return verb==="GET"?"ledger.read":null;return verb==="GET"?key+".read":["POST","PATCH","DELETE"].includes(verb)?key+".manage":null;}}
  if(/^\\/api\\/v1\\/customers\\/[^/]+\\/ledger$/.test(path))return verb==="GET"?"ledger.read":null;\n  if(path==="/api/v1/recharges")return verb==="POST"?"subscriptions.manage":null;
  if(path==="/api/v1/business-modules/summary")return verb==="GET"?"areas.read":null;
  if(matches("/api/v1/customers"))return ({GET:"customers.read",POST:"customers.create",PATCH:"customers.update",DELETE:"customers.delete"})[verb]||null;
  if(matches("/api/v1/packages"))return verb==="GET"?"packages.read":["POST","PATCH"].includes(verb)?"packages.manage":null;
  if(matches("/api/v1/subscriptions"))return verb==="GET"?"subscriptions.read":["POST","PATCH"].includes(verb)?"subscriptions.manage":null;
  if(matches("/api/v1/invoices"))return verb==="GET"?"billing.read":verb==="POST"?"invoices.create":null;
  if(matches("/api/v1/payments"))return verb==="GET"?"billing.read":verb==="POST"?"payments.create":null;
  if(path==="/api/v1/billing/generate")return verb==="POST"?"billing.generate":null;
  if(path==="/api/v1/billing/runs")return verb==="GET"?"billing.read":null;
  if(matches("/api/v1/tickets"))return verb==="GET"?"tickets.read":["POST","PATCH"].includes(verb)?"tickets.manage":null;
  if(matches("/api/v1/routers"))return verb==="GET"?"routers.read":["POST","PATCH","DELETE"].includes(verb)?"routers.manage":verb==="POST"||verb==="PATCH"?"routers.provision":null;
  if(matches("/api/v1/olts")||matches("/api/v1/onus")||matches("/api/v1/pons")||matches("/api/v1/olt-alarms"))return verb==="GET"?"olts.read":["POST","PATCH","DELETE"].includes(verb)?"olts.manage":null;
  if(path==="/api/v1/reports/summary")return verb==="GET"?"reports.read":null;
  if(path==="/api/v1/audit-logs")return verb==="GET"?"audit.read":null;
  return null;
}