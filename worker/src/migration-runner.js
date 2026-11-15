// Durable, idempotent D1 migration runner. The ledger survives Worker isolate restarts.
export async function runMigrations(env){
 const migrations=[
 ['users.name','ALTER TABLE users ADD COLUMN name TEXT'],
 ['users.phone','ALTER TABLE users ADD COLUMN phone TEXT'],
 ['users.status',"ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"],
 ['users.avatar','ALTER TABLE users ADD COLUMN avatar TEXT'],
 ['users.pw_salt','ALTER TABLE users ADD COLUMN password_salt TEXT'],
 ['users.last_login','ALTER TABLE users ADD COLUMN last_login TEXT'],
 ['users.token_version','ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0'],
 ['invoices.billing_period','ALTER TABLE invoices ADD COLUMN billing_period TEXT'],
 ['org.email','ALTER TABLE organizations ADD COLUMN email TEXT'],
 ['org.phone','ALTER TABLE organizations ADD COLUMN phone TEXT'],
 ['org.address','ALTER TABLE organizations ADD COLUMN address TEXT'],
 ['org.currency',"ALTER TABLE organizations ADD COLUMN currency TEXT DEFAULT 'USD'"],
 ['cust.balance','ALTER TABLE customers ADD COLUMN balance REAL DEFAULT 0'],
 ['cust.notes','ALTER TABLE customers ADD COLUMN notes TEXT'],
 ['cust.inst_addr','ALTER TABLE customers ADD COLUMN installation_address TEXT'],
 ['cust.inst_date','ALTER TABLE customers ADD COLUMN installation_date TEXT'],
 ['cust.id_type','ALTER TABLE customers ADD COLUMN id_type TEXT'],
 ['cust.id_num','ALTER TABLE customers ADD COLUMN id_number TEXT'],
 ['sub.renew','ALTER TABLE subscriptions ADD COLUMN auto_renew INTEGER DEFAULT 0'],
 ['pkg.sd','ALTER TABLE packages ADD COLUMN speed_down TEXT'],
 ['pkg.su','ALTER TABLE packages ADD COLUMN speed_up TEXT'],
 ['refunds',"CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,payment_id TEXT NOT NULL,invoice_id TEXT NOT NULL,customer_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL DEFAULT 'cash',reference TEXT,reason TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),created_by TEXT NOT NULL,completed_by TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),completed_at TEXT,FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE,FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE)"],
 ['refunds.reference_index',"CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_org_reference ON refunds(organization_id,reference) WHERE reference IS NOT NULL AND reference<>''"],
 ['refunds.idempotency_key','ALTER TABLE refunds ADD COLUMN idempotency_key TEXT'],
 ['refunds.idempotency_index',"CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_org_idempotency ON refunds(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key<>''"],
 ['refunds.payment_index','CREATE INDEX IF NOT EXISTS idx_refunds_payment_status ON refunds(organization_id,payment_id,status)'],
 ['customer_portal_accounts',"CREATE TABLE IF NOT EXISTS customer_portal_accounts(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,customer_id TEXT NOT NULL,email TEXT NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),token_version INTEGER NOT NULL DEFAULT 0,last_login TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(organization_id,email),UNIQUE(organization_id,customer_id),FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE)"],
 ['notif',"CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,user_id TEXT,title TEXT NOT NULL,message TEXT,type TEXT DEFAULT 'info',is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT(datetime('now')))"],
 ['settings',"CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT,created_at TEXT DEFAULT(datetime('now')),updated_at TEXT DEFAULT(datetime('now')),UNIQUE(organization_id,key))"],
 ['pppoe',"CREATE TABLE IF NOT EXISTS pppoe_accounts(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,customer_id TEXT NOT NULL,username TEXT NOT NULL,password TEXT NOT NULL,ip_address TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT(datetime('now')),updated_at TEXT DEFAULT(datetime('now')),UNIQUE(organization_id,username))"],
 ['network_devices.model','ALTER TABLE network_devices ADD COLUMN model TEXT'],
 ['network_devices.protocol','ALTER TABLE network_devices ADD COLUMN management_protocol TEXT'],
 ['network_devices.pon_ports','ALTER TABLE network_devices ADD COLUMN pon_ports INTEGER'],
 ['onu_devices',"CREATE TABLE IF NOT EXISTS onu_devices(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,olt_device_id TEXT,customer_id TEXT,serial_number TEXT NOT NULL,mac_address TEXT,pon_port TEXT,onu_number INTEGER,model TEXT,status TEXT NOT NULL DEFAULT 'unknown',rx_power_dbm REAL,last_seen_at TEXT,notes TEXT,created_at TEXT DEFAULT(datetime('now')),updated_at TEXT DEFAULT(datetime('now')),UNIQUE(organization_id,serial_number))"],
 ['user_permissions',"CREATE TABLE IF NOT EXISTS user_permissions(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,user_id TEXT NOT NULL,permission TEXT NOT NULL,allowed INTEGER NOT NULL CHECK(allowed IN(0,1)),updated_by TEXT,updated_at TEXT DEFAULT(datetime('now')),UNIQUE(organization_id,user_id,permission))"],
 ['invoices.period_index','CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_subscription_period ON invoices(organization_id,subscription_id,billing_period) WHERE subscription_id IS NOT NULL AND billing_period IS NOT NULL'],
 ['onu_devices.index','CREATE INDEX IF NOT EXISTS idx_onu_devices_org_status ON onu_devices(organization_id,status)'],
 ['invoices.number_index','CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_number ON invoices(organization_id,invoice_number)'],
 ['payments.reference_index',"CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_org_reference ON payments(organization_id,transaction_ref) WHERE transaction_ref IS NOT NULL AND transaction_ref<>''"]
 ];
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT(datetime('now')))").run();
 await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(name)").run();
 const results=[];
 for(const[name,sql]of migrations){
  const applied=await env.DB.prepare("SELECT name FROM schema_migrations WHERE name=?").bind(name).first();
  if(applied){results.push(name+':SKIP');continue}
  try{await env.DB.prepare(sql).run()}
  catch(e){
   const message=String(e?.message||'');
   if(!/duplicate column name|already exists/i.test(message))throw new Error('NEXUS migration '+name+' failed: '+message.slice(0,140));
  }
  await env.DB.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES(?)").bind(name).run();
  results.push(name+':RECORDED');
 }
 return results;
}
