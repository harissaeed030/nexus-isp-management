const FRONTEND_HTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXUS ISP</title><style>body{background:#0a1628;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}h1{color:#00c853}p{color:#8a9bb0}</style></head><body><div><h1>NEXUS ISP Management</h1><p>API is running. Frontend deployment in progress.</p><p>API base: <a href="/api/health" style="color:#00e676">/api/health</a></p></div></body></html>';

function uuid(){return crypto.randomUUID()}
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}})}
const CORS={'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
async function parseBody(r){try{return await r.json()}catch{return null}}
async function hashPw(pw,salt){const s=salt?hex2b(salt):crypto.getRandomValues(new Uint8Array(16));const enc=new TextEncoder();const km=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},km,256);return{hash:b2h(new Uint8Array(bits)),salt:b2h(s)}}
async function verifyPw(pw,h,salt){if(!h)return false;if(!salt)return pw===h;const{hash}=await hashPw(pw,salt);return hash===h}
function b2h(b){return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('')}
function hex2b(h){const a=new Uint8Array(h.length/2);for(let i=0;i<h.length;i+=2)a[i/2]=parseInt(h.substr(i,2),16);return a}
async function signJWT(p,sec){const e=new TextEncoder();const h=b64u(e.encode(JSON.stringify({alg:'HS256',typ:'JWT'})));const p64=b64u(e.encode(JSON.stringify(p)));const d=h+'.'+p64;const k=await crypto.subtle.importKey('raw',e.encode(sec),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',k,e.encode(d));return d+'.'+b64u(new Uint8Array(sig))}
async function verifyJWT(t,sec){try{const ps=t.split('.');if(ps.length!==3)return null;const d=ps[0]+'.'+ps[1];const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(sec),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('HMAC',k,b64uDec(ps[2]),new TextEncoder().encode(d)))return null;const pl=JSON.parse(new TextDecoder().decode(b64uDec(ps[1])));if(pl.exp&&Date.now()>pl.exp)return null;return pl}catch{return null}}
function b64u(b){return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64uDec(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const b=atob(s);const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
function getSec(env){if(!env.JWT_SECRET)throw new Error('JWT_SECRET not configured');return env.JWT_SECRET}
async function getAuth(r,env){const a=r.headers.get('Authorization');if(!a||!a.startsWith('Bearer '))return null;return await verifyJWT(a.slice(7),getSec(env))}
async function audit(env,oid,uid,act,det,ip){try{await env.DB.prepare('INSERT INTO audit_log(id,organization_id,user_id,action,detail,ip_address)VALUES(?,?,?,?,?,?)').bind(uuid(),oid,uid,act,det||null,ip||null).run()}catch{}}
function vEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e||'')}
function vReq(o,f){return f.filter(x=>!o[x]&&o[x]!==0)}
function s(v){return typeof v==='string'?v.trim():v}
function pg(url,d=20){const page=Math.max(1,parseInt(url.searchParams.get('page')||'1'));const pp=Math.min(100,Math.max(1,parseInt(url.searchParams.get('per_page')||String(d))));return{page,pp,off:(page-1)*pp}}


function corsHeaders(request,env){
 const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean),h=new Headers(CORS);
 h.set('Access-Control-Max-Age','86400');
 let trustedPagesOrigin=false;
 try{const u=new URL(origin||'');trustedPagesOrigin=u.protocol==='https:'&&(u.hostname==='nexus-isp-management.pages.dev'||u.hostname.endsWith('.nexus-isp-management.pages.dev'))}catch{}
 if(origin&&(allowed.includes(origin)||trustedPagesOrigin)){h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin')}
 return h
}
function withCors(response,request,env){for(const [k,v] of corsHeaders(request,env))response.headers.set(k,v);return response}
function roleAllowed(role,path,method){
 if(role==='admin'||role==='owner')return true;
 if(path==='/api/auth/me'||path==='/api/auth/logout')return true;
 if(path==='/api/profile'&&(method==='GET'||method==='PUT'))return true;
 if(path==='/api/profile/password'&&method==='PUT')return true;
 const grants={
  billing:{GET:['/api/dashboard/stats','/api/customers','/api/packages','/api/subscriptions','/api/invoices','/api/payments','/api/reports/revenue','/api/reports/customers','/api/reports/subscriptions'],POST:['/api/invoices','/api/billing/generate'],PUT:['/api/invoices']},
  support:{GET:['/api/dashboard/stats','/api/customers','/api/complaints'],POST:['/api/complaints'],PUT:['/api/complaints']},
  technician:{GET:['/api/dashboard/stats','/api/customers','/api/packages','/api/subscriptions','/api/complaints','/api/pppoe','/api/network/devices','/api/network/status'],POST:['/api/complaints','/api/pppoe','/api/network/devices'],PUT:['/api/complaints','/api/pppoe','/api/network/devices'],DELETE:['/api/pppoe','/api/network/devices']},
  staff:{GET:['/api/dashboard/stats','/api/customers','/api/complaints'],POST:['/api/complaints']}
 };
 return (grants[role]?.[method]||[]).some(p=>path===p||path.startsWith(p+'/'))
}
async function loginRateLimited(env,ip,email){
 await env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at<datetime('now','-1 day')").run();
 const [a,b]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_address=? AND attempted_at>=datetime('now','-15 minutes')").bind(ip).first(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE email=? AND attempted_at>=datetime('now','-15 minutes')").bind(email).first()
 ]);
 return (a?.n||0)>=30||(b?.n||0)>=10
}
async function recordLoginFailure(env,ip,email){await env.DB.prepare("INSERT INTO login_attempts(id,ip_address,email)VALUES(?,?,?)").bind(uuid(),ip,email).run()}
async function pppoeCryptoKey(env,usages){
 if(!env.JWT_SECRET)throw new Error('JWT_SECRET not configured');
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.JWT_SECRET),'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('NEXUS-PPPOE-SALT-V1'),info:new TextEncoder().encode('NEXUS-PPPOE-PASSWORD-ENCRYPTION')},material,{name:'AES-GCM',length:256},false,usages)
}
async function encryptPppoePassword(password,env){
 const key=await pppoeCryptoKey(env,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(password));
 return 'enc:v1:'+b64u(iv)+':'+b64u(new Uint8Array(cipher))
}
async function decryptPppoePassword(value,env){
 const p=String(value||'').split(':');if(p.length!==4||p[0]!=='enc'||p[1]!=='v1')throw new Error('Unsupported PPPoE password format');
 const key=await pppoeCryptoKey(env,['decrypt']),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64uDec(p[2])},key,b64uDec(p[3]));
 return new TextDecoder().decode(plain)
}

async function runMigrations(env){const R=[];const tasks=[];const t=(l,q)=>tasks.push((async()=>{try{await env.DB.prepare(q).run();R.push(l+':OK')}catch(e){R.push(l+':'+(e.message.includes('duplicate')||e.message.includes('already')?'exists':e.message.slice(0,60)))}})());
t('users.name','ALTER TABLE users ADD COLUMN name TEXT');t('users.phone','ALTER TABLE users ADD COLUMN phone TEXT');t('users.status','ALTER TABLE users ADD COLUMN status TEXT DEFAULT \'active\'');t('users.avatar','ALTER TABLE users ADD COLUMN avatar TEXT');t('users.pw_salt','ALTER TABLE users ADD COLUMN password_salt TEXT');t('users.last_login','ALTER TABLE users ADD COLUMN last_login TEXT');t('invoices.billing_period','ALTER TABLE invoices ADD COLUMN billing_period TEXT');
t('org.email','ALTER TABLE organizations ADD COLUMN email TEXT');t('org.phone','ALTER TABLE organizations ADD COLUMN phone TEXT');t('org.address','ALTER TABLE organizations ADD COLUMN address TEXT');t('org.currency','ALTER TABLE organizations ADD COLUMN currency TEXT DEFAULT \'USD\'');
t('cust.balance','ALTER TABLE customers ADD COLUMN balance REAL DEFAULT 0');t('cust.notes','ALTER TABLE customers ADD COLUMN notes TEXT');t('cust.inst_addr','ALTER TABLE customers ADD COLUMN installation_address TEXT');t('cust.inst_date','ALTER TABLE customers ADD COLUMN installation_date TEXT');t('cust.id_type','ALTER TABLE customers ADD COLUMN id_type TEXT');t('cust.id_num','ALTER TABLE customers ADD COLUMN id_number TEXT');
t('sub.renew','ALTER TABLE subscriptions ADD COLUMN auto_renew INTEGER DEFAULT 0');t('pkg.sd','ALTER TABLE packages ADD COLUMN speed_down TEXT');t('pkg.su','ALTER TABLE packages ADD COLUMN speed_up TEXT');
t('notif','CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,user_id TEXT,title TEXT NOT NULL,message TEXT,type TEXT DEFAULT \'info\',is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT(datetime(\'now\')))');
t('settings','CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT,created_at TEXT DEFAULT(datetime(\'now\')),updated_at TEXT DEFAULT(datetime(\'now\')),UNIQUE(organization_id,key))');
t('pppoe','CREATE TABLE IF NOT EXISTS pppoe_accounts(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,customer_id TEXT NOT NULL,username TEXT NOT NULL,password TEXT NOT NULL,ip_address TEXT,status TEXT DEFAULT \'active\',created_at TEXT DEFAULT(datetime(\'now\')),updated_at TEXT DEFAULT(datetime(\'now\')),UNIQUE(organization_id,username))');
await Promise.all(tasks);try{await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_subscription_period ON invoices(organization_id,subscription_id,billing_period) WHERE subscription_id IS NOT NULL AND billing_period IS NOT NULL').run();R.push('invoices.period_index:OK')}catch(e){R.push('invoices.period_index:'+e.message.slice(0,60))}return R}

let _migrated=false;
export default{async fetch(request,env){const url=new URL(request.url);const path=url.pathname.replace(/^\/api\/v1\//,'/api/');const m=request.method;
if(!_migrated){try{await runMigrations(env)}catch(e){}_migrated=true}
if(m==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request,env)});
if(path==='/api/health'){let st='ok';try{const r=await env.DB.prepare('SELECT 1 AS ok').first();st=r?.ok===1?'ok':'bad'}catch{st='err'}return withCors(json({status:st==='ok'?'healthy':'degraded',database:st},st==='ok'?200:503),request,env)}
if(path==='/api/migrate'&&m==='POST')return withCors(json({result:await runMigrations(env)}),request,env);
if(path.startsWith('/api/'))return withCors(await handleApi(request,env,url,path,m),request,env);
return new Response(FRONTEND_HTML,{headers:{'Content-Type':'text/html;charset=utf-8'}})}};

async function handleApi(request,env,url,path,m){const ip=request.headers.get('CF-Connecting-IP')||'unknown';try{
if(path==='/api/auth/register'&&m==='POST')return await authReg(request,env,ip);
if(path==='/api/auth/login'&&m==='POST')return await authLogin(request,env,ip);
const auth=await getAuth(request,env);if(!auth)return json({error:'Authentication required'},401);
const{orgId,userId,role}=auth;if(!roleAllowed(role,path,m))return json({error:'Forbidden',message:'Your role does not have permission for this action'},403);
if(path==='/api/auth/me'&&m==='GET')return await authMe(env,auth);
if(path==='/api/auth/logout'&&m==='POST')return json({success:true});
if(path==='/api/dashboard/stats'&&m==='GET')return await dashStats(env,orgId);
if(path==='/api/customers'&&m==='GET')return await listCust(env,url,orgId);
if(path==='/api/customers'&&m==='POST')return await createCust(request,env,orgId,userId,ip);
if(path.match(/^\/api\/customers\/[^/]+$/)&&m==='GET')return await getCust(env,path,orgId);
if(path.match(/^\/api\/customers\/[^/]+$/)&&m==='PUT')return await updateCust(request,env,path,orgId,userId,ip);
if(path.match(/^\/api\/customers\/[^/]+$/)&&m==='DELETE')return await delCust(env,path,orgId,userId,ip);
if(path==='/api/packages'&&m==='GET')return await listPkg(env,url,orgId);
if(path==='/api/packages'&&m==='POST')return await createPkg(request,env,orgId,userId,ip);
if(path.match(/^\/api\/packages\/[^/]+$/)&&m==='GET')return await getPkg(env,path,orgId);
if(path.match(/^\/api\/packages\/[^/]+$/)&&m==='PUT')return await updatePkg(request,env,path,orgId,userId,ip);
if(path.match(/^\/api\/packages\/[^/]+$/)&&m==='DELETE')return await delPkg(env,path,orgId,userId,ip);
if(path==='/api/subscriptions'&&m==='GET')return await listSubs(env,url,orgId);
if(path==='/api/subscriptions'&&m==='POST')return await createSub(request,env,orgId,userId,ip);
if(path.match(/^\/api\/subscriptions\/[^/]+$/)&&m==='GET')return await getSub(env,path,orgId);
if(path.match(/^\/api\/subscriptions\/[^/]+$/)&&m==='PUT')return await updateSub(request,env,path,orgId,userId,ip);
if(path.match(/^\/api\/subscriptions\/[^/]+$/)&&m==='DELETE')return await delSub(env,path,orgId,userId,ip);
if(path==='/api/invoices'&&m==='GET')return await listInv(env,url,orgId);
if(path==='/api/invoices'&&m==='POST')return await createInv(request,env,orgId,userId,ip);
if(path==='/api/billing/generate'&&m==='POST')return await generateBilling(request,env,orgId,userId,ip);
if(path.match(/^\/api\/invoices\/[^/]+$/)&&m==='GET')return await getInv(env,path,orgId);
if(path.match(/^\/api\/invoices\/[^/]+\/payments$/)&&m==='POST')return await recPay(request,env,path,orgId,userId,ip);
if(path==='/api/payments'&&m==='GET')return await listPay(env,url,orgId);
if(path==='/api/complaints'&&m==='GET')return await listComp(env,url,orgId);
if(path==='/api/complaints'&&m==='POST')return await createComp(request,env,orgId,userId,ip);
if(path.match(/^\/api\/complaints\/[^/]+$/)&&m==='PUT')return await updateComp(request,env,path,orgId,userId,ip);
if(path==='/api/staff'&&m==='GET')return await listStaff(env,orgId);
if(path==='/api/staff'&&m==='POST')return await createStaff(request,env,orgId,userId,role,ip);
if(path==='/api/pppoe'&&m==='GET')return await listPppoe(env,url,orgId);
if(path==='/api/pppoe'&&m==='POST')return await createPppoe(request,env,orgId,userId,ip);
if(path.match(/^\/api\/pppoe\/[^/]+$/)&&m==='GET')return await getPppoe(env,path,orgId);
if(path.match(/^\/api\/pppoe\/[^/]+$/)&&m==='PUT')return await updatePppoe(request,env,path,orgId,userId,ip);
if(path.match(/^\/api\/pppoe\/[^/]+$/)&&m==='DELETE')return await delPppoe(env,path,orgId,userId,ip);
if(path==='/api/network/devices'&&m==='GET')return await listNetworkDevices(env,url,orgId);
if(path==='/api/network/devices'&&m==='POST')return await createNetworkDevice(request,env,orgId,userId,ip);
if(path.match(/^\/api\/network\/devices\/[^/]+$/)&&m==='GET')return await getNetworkDevice(env,path,orgId);
if(path.match(/^\/api\/network\/devices\/[^/]+$/)&&m==='PUT')return await updateNetworkDevice(request,env,path,orgId,userId,ip);
if(path.match(/^\/api\/network\/devices\/[^/]+$/)&&m==='DELETE')return await delNetworkDevice(env,path,orgId,userId,ip);
if(path==='/api/network/status'&&m==='GET')return await networkStatus(env,orgId);
if(path.match(/^\/api\/staff\/[^/]+$/)&&m==='PUT')return await updateStaff(request,env,path,orgId,userId,role,ip);
if(path.match(/^\/api\/staff\/[^/]+$/)&&m==='DELETE')return await delStaff(env,path,orgId,role,userId,ip);
if(path==='/api/reports/revenue'&&m==='GET')return await repRev(env,url,orgId);
if(path==='/api/reports/customers'&&m==='GET')return await repCust(env,orgId);
if(path==='/api/reports/subscriptions'&&m==='GET')return await repSubs(env,orgId);
if(path==='/api/audit-logs'&&m==='GET')return await listAudit(env,url,orgId);
if(path==='/api/settings'&&m==='GET')return await getSet(env,orgId);
if(path==='/api/settings'&&m==='PUT')return await updSet(request,env,orgId,userId,ip);
if(path==='/api/profile'&&m==='GET')return await getProf(env,auth);
if(path==='/api/profile'&&m==='PUT')return await updProf(request,env,auth,ip);
if(path==='/api/profile/password'&&m==='PUT')return await chgPw(request,env,auth,ip);
if(path==='/api/company'&&m==='GET')return await getCo(env,orgId);
if(path==='/api/company'&&m==='PUT')return await updCo(request,env,orgId,userId,ip);
return json({error:'Not Found',path},404)}catch(e){return json({error:'Server Error',message:e.message},500)}}

async function authReg(r,env,ip){
 const raw=await parseBody(r);if(!raw||typeof raw!=='object'||Array.isArray(raw))return json({error:'Invalid body'},400);
 const b={companyName:s(raw.companyName??raw.company_name??raw.company??''),slug:s(raw.slug??raw.organizationSlug??raw.organization_slug??''),email:s(raw.email??''),password:raw.password,name:s(raw.name??raw.fullName??raw.full_name??raw.owner_name??raw.ownerName??''),phone:s(raw.phone??'')};
 if(!b.slug&&b.companyName)b.slug=b.companyName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
 const missing=vReq(b,['companyName','email','password','name']);if(missing.length)return json({error:'Missing fields',fields:missing},400);
 if(!vEmail(b.email))return json({error:'Invalid email'},400);
 if(typeof b.password!=='string'||b.password.length<8)return json({error:'Password must be at least 8 characters'},400);
 if(typeof b.companyName!=='string'||b.companyName.length>120)return json({error:'Company name must be 1-120 characters'},400);
 if(typeof b.name!=='string'||b.name.length>120)return json({error:'Owner name must be 1-120 characters'},400);
 if(!b.slug)return json({error:'A valid organization slug could not be generated'},400);
 const slug=b.slug.toLowerCase().replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);if(!slug)return json({error:'Invalid organization slug'},400);
 if(await env.DB.prepare('SELECT id FROM organizations WHERE slug=?').bind(slug).first())return json({error:'Slug taken'},409);
 const email=b.email.toLowerCase();if(await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first())return json({error:'Email registered'},409);
 const oid=uuid(),uid=uuid(),{hash,salt}=await hashPw(b.password);
 try{await env.DB.batch([env.DB.prepare('INSERT INTO organizations(id,name,slug,plan,email,phone)VALUES(?,?,?,?,?,?)').bind(oid,b.companyName,slug,'free',email,b.phone||null),env.DB.prepare('INSERT INTO users(id,organization_id,email,password_hash,password_salt,name,role,phone)VALUES(?,?,?,?,?,?,?,?)').bind(uid,oid,email,hash,salt,b.name,'admin',b.phone||null)]);}catch(e){const message=String(e?.message||'');if(/unique|constraint/i.test(message))return json({error:'Email or organization slug is already registered'},409);throw e;}
 await audit(env,oid,uid,'register','Company:'+b.companyName,ip);
 const tk=await signJWT({userId:uid,orgId:oid,role:'admin',email,name:b.name,exp:Date.now()+604800000},getSec(env));
 return json({success:true,token:tk,user:{id:uid,email,name:b.name,role:'admin',orgId:oid}},201)
}

async function authLogin(r,env,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);if(!b.email||!b.password)return json({error:'Email and password required'},400);
const email=String(b.email).trim().toLowerCase();if(await loginRateLimited(env,ip,email))return json({error:'Too many login attempts. Try again in 15 minutes.'},429);
const u=await env.DB.prepare("SELECT * FROM users WHERE email=? AND status='active'").bind(email).first();if(!u||!await verifyPw(b.password,u.password_hash,u.password_salt)){await recordLoginFailure(env,ip,email);return json({error:'Invalid credentials'},401);}
await env.DB.prepare('DELETE FROM login_attempts WHERE ip_address=? AND email=?').bind(ip,email).run();
await env.DB.prepare("UPDATE users SET last_login=datetime('now'),updated_at=datetime('now')WHERE id=?").bind(u.id).run();
const tk=await signJWT({userId:u.id,orgId:u.organization_id,role:u.role,email:u.email,name:u.name||u.email,exp:Date.now()+604800000},getSec(env));
await audit(env,u.organization_id,u.id,'login','User logged in',ip);
return json({success:true,token:tk,user:{id:u.id,email:u.email,name:u.name||u.email,role:u.role,orgId:u.organization_id}})}

async function authMe(env,auth){const u=await env.DB.prepare('SELECT id,email,name,role,phone,status,organization_id FROM users WHERE id=?').bind(auth.userId).first();if(!u)return json({error:'Not found'},404);const org=await env.DB.prepare('SELECT id,name,slug,email,phone,address,currency FROM organizations WHERE id=?').bind(auth.orgId).first();return json({user:u,tenant:org})}

async function dashStats(env,oid){const c=await env.DB.prepare('SELECT COUNT(*)v FROM customers WHERE organization_id=?').bind(oid).first();const ac=await env.DB.prepare("SELECT COUNT(*)v FROM customers WHERE organization_id=? AND status='active'").bind(oid).first();const pk=await env.DB.prepare('SELECT COUNT(*)v FROM packages WHERE organization_id=?').bind(oid).first();const sc=await env.DB.prepare('SELECT COUNT(*)v FROM subscriptions WHERE organization_id=?').bind(oid).first();const pi=await env.DB.prepare("SELECT COUNT(*)v,COALESCE(SUM(total),0)amt FROM invoices WHERE organization_id=? AND status='pending'").bind(oid).first();const rev=await env.DB.prepare("SELECT COALESCE(SUM(amount),0)v FROM payments WHERE organization_id=? AND status='completed'").bind(oid).first();const oc=await env.DB.prepare("SELECT COUNT(*)v FROM support_tickets WHERE organization_id=? AND status='open'").bind(oid).first();const st=await env.DB.prepare('SELECT COUNT(*)v FROM users WHERE organization_id=?').bind(oid).first();const mr=await env.DB.prepare("SELECT strftime('%Y-%m',paid_at)m,COALESCE(SUM(amount),0)t FROM payments WHERE organization_id=? AND status='completed'AND paid_at>=datetime('now','-6 months')GROUP BY m ORDER BY m").bind(oid).all();return json({customers:c.v,activeCustomers:ac.v,packages:pk.v,subscriptions:sc.v,pendingInvoices:pi.v,pendingAmount:pi.amt,totalRevenue:rev.v,openComplaints:oc.v,staff:st.v,monthlyRevenue:mr.results||[]})}

async function listCust(env,url,oid){const{page,pp,off}=pg(url);const q=url.searchParams.get('search')||'';const st=url.searchParams.get('status')||'';let w='WHERE organization_id=?';const p=[oid];if(q){w+=' AND(first_name LIKE? OR last_name LIKE? OR email LIKE? OR phone LIKE?)';const s='%'+q+'%';p.push(s,s,s,s)}if(st){w+=' AND status=?';p.push(st)}const cnt=await env.DB.prepare('SELECT COUNT(*)t FROM customers '+w).bind(...p).first();const rows=await env.DB.prepare('SELECT * FROM customers '+w+' ORDER BY created_at DESC LIMIT? OFFSET?').bind(...p,pp,off).all();return json({data:rows.results||[],pagination:{page,pp,total:cnt.t,totalPages:Math.ceil(cnt.t/pp)}})}
async function createCust(r,env,oid,uid,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ms=vReq(b,['first_name']);if(ms.length)return json({error:'Missing fields',fields:ms},400);const id=uuid();const code='CUS-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();await env.DB.prepare('INSERT INTO customers(id,organization_id,first_name,last_name,email,phone,address,city,status,customer_code,balance,notes,installation_address,installation_date,id_type,id_number)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,oid,s(b.first_name),b.last_name||'',b.email||null,b.phone||null,b.address||null,b.city||null,b.status||'active',code,b.balance||0,b.notes||null,b.installation_address||null,b.installation_date||null,b.id_type||null,b.id_number||null).run();await audit(env,oid,uid,'create_customer','Customer:'+b.first_name,ip);return json(await env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(id).first(),201)}
async function getCust(env,path,oid){const id=path.split('/')[3];const cu=await env.DB.prepare('SELECT * FROM customers WHERE id=? AND organization_id=?').bind(id,oid).first();if(!cu)return json({error:'Not found'},404);const subs=await env.DB.prepare('SELECT s.*,p.name package_name,p.price,p.speed_mbps FROM subscriptions s LEFT JOIN packages p ON s.package_id=p.id WHERE s.customer_id=? AND s.organization_id=?').bind(id,oid).all();const inv=await env.DB.prepare('SELECT * FROM invoices WHERE customer_id=? AND organization_id=? ORDER BY created_at DESC').bind(id,oid).all();const pay=await env.DB.prepare('SELECT * FROM payments WHERE customer_id=? AND organization_id=? ORDER BY created_at DESC').bind(id,oid).all();const comp=await env.DB.prepare('SELECT * FROM support_tickets WHERE customer_id=? AND organization_id=? ORDER BY created_at DESC').bind(id,oid).all();return json({...cu,subscriptions:subs.results,invoices:inv.results,payments:pay.results,complaints:comp.results})}
async function updateCust(r,env,path,oid,uid,ip){const id=path.split('/')[3];const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ex=await env.DB.prepare('SELECT * FROM customers WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);const f=['first_name','last_name','email','phone','address','city','status','notes','installation_address','installation_date','id_type','id_number','balance'];const u=[],p=[];for(const x of f){if(b[x]!==undefined){u.push(x+'=?');p.push(b[x])}}if(!u.length)return json({error:'No fields'},400);u.push("updated_at=datetime('now')");p.push(id,oid);await env.DB.prepare('UPDATE customers SET '+u.join(', ')+' WHERE id=? AND organization_id=?').bind(...p).run();await audit(env,oid,uid,'update_customer','Updated:'+ex.first_name,ip);return json(await env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(id).first())}
async function delCust(env,path,oid,uid,ip){const id=path.split('/')[3];const ex=await env.DB.prepare('SELECT * FROM customers WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);await env.DB.prepare('DELETE FROM customers WHERE id=? AND organization_id=?').bind(id,oid).run();await audit(env,oid,uid,'delete_customer','Deleted:'+ex.first_name,ip);return json({success:true})}

async function listPkg(env,url,oid){const{page,pp,off}=pg(url,50);const cnt=await env.DB.prepare('SELECT COUNT(*)t FROM packages WHERE organization_id=?').bind(oid).first();const rows=await env.DB.prepare('SELECT * FROM packages WHERE organization_id=? ORDER BY created_at DESC LIMIT? OFFSET?').bind(oid,pp,off).all();return json({data:rows.results||[],pagination:{page,pp,total:cnt.t,totalPages:Math.ceil(cnt.t/pp)}})}
async function createPkg(r,env,oid,uid,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ms=vReq(b,['name','price']);if(ms.length)return json({error:'Missing fields',fields:ms},400);const id=uuid();await env.DB.prepare('INSERT INTO packages(id,organization_id,name,description,speed_mbps,speed_down,speed_up,price,billing_cycle,data_limit_gb,is_active)VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,oid,s(b.name),b.description||null,parseInt(b.speed_mbps||0),b.speed_down||null,b.speed_up||null,parseFloat(b.price),b.billing_cycle||'monthly',b.data_limit_gb?parseInt(b.data_limit_gb):null,b.is_active!==undefined?(b.is_active?1:0):1).run();await audit(env,oid,uid,'create_package','Package:'+b.name,ip);return json(await env.DB.prepare('SELECT * FROM packages WHERE id=?').bind(id).first(),201)}
async function getPkg(env,path,oid){const id=path.split('/')[3];const p=await env.DB.prepare('SELECT * FROM packages WHERE id=? AND organization_id=?').bind(id,oid).first();return p?json(p):json({error:'Not found'},404)}
async function updatePkg(r,env,path,oid,uid,ip){const id=path.split('/')[3];const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ex=await env.DB.prepare('SELECT * FROM packages WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);const f=['name','description','speed_mbps','speed_down','speed_up','price','billing_cycle','data_limit_gb'];const u=[],p=[];for(const x of f){if(b[x]!==undefined){u.push(x+'=?');p.push(b[x])}}if(b.is_active!==undefined){u.push('is_active=?');p.push(b.is_active?1:0)}if(!u.length)return json({error:'No fields'},400);u.push("updated_at=datetime('now')");p.push(id,oid);await env.DB.prepare('UPDATE packages SET '+u.join(', ')+' WHERE id=? AND organization_id=?').bind(...p).run();await audit(env,oid,uid,'update_package','Updated:'+ex.name,ip);return json(await env.DB.prepare('SELECT * FROM packages WHERE id=?').bind(id).first())}
async function delPkg(env,path,oid,uid,ip){const id=path.split('/')[3];const ex=await env.DB.prepare('SELECT * FROM packages WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);await env.DB.prepare('DELETE FROM packages WHERE id=? AND organization_id=?').bind(id,oid).run();await audit(env,oid,uid,'delete_package','Deleted:'+ex.name,ip);return json({success:true})}

async function listSubs(env,url,oid){const{page,pp,off}=pg(url);const cnt=await env.DB.prepare('SELECT COUNT(*)t FROM subscriptions WHERE organization_id=?').bind(oid).first();const rows=await env.DB.prepare('SELECT s.*,c.first_name,c.last_name,p.name package_name,p.price,p.speed_mbps FROM subscriptions s LEFT JOIN customers c ON s.customer_id=c.id LEFT JOIN packages p ON s.package_id=p.id WHERE s.organization_id=? ORDER BY s.created_at DESC LIMIT? OFFSET?').bind(oid,pp,off).all();return json({data:rows.results||[],pagination:{page,pp,total:cnt.t,totalPages:Math.ceil(cnt.t/pp)}})}
async function createSub(r,env,oid,uid,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ms=vReq(b,['customer_id','package_id']);if(ms.length)return json({error:'Missing fields',fields:ms},400);if(!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND organization_id=?').bind(b.customer_id,oid).first())return json({error:'Customer not found'},404);if(!await env.DB.prepare('SELECT id FROM packages WHERE id=? AND organization_id=?').bind(b.package_id,oid).first())return json({error:'Package not found'},404);const id=uuid();const sd=b.start_date||new Date().toISOString().split('T')[0];let ed=b.end_date;if(!ed){const d=new Date(sd);d.setMonth(d.getMonth()+1);ed=d.toISOString().split('T')[0]}await env.DB.prepare('INSERT INTO subscriptions(id,organization_id,customer_id,package_id,status,start_date,end_date,auto_renew)VALUES(?,?,?,?,?,?,?,?)').bind(id,oid,b.customer_id,b.package_id,b.status||'active',sd,ed,b.auto_renew?1:0).run();await audit(env,oid,uid,'create_subscription','Sub for '+b.customer_id,ip);return json(await env.DB.prepare('SELECT * FROM subscriptions WHERE id=?').bind(id).first(),201)}
async function updateSub(r,env,path,oid,uid,ip){const id=path.split('/')[3];const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ex=await env.DB.prepare('SELECT * FROM subscriptions WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);const f=['status','start_date','end_date'];const u=[],p=[];for(const x of f){if(b[x]!==undefined){u.push(x+'=?');p.push(b[x])}}if(b.auto_renew!==undefined){u.push('auto_renew=?');p.push(b.auto_renew?1:0)}if(!u.length)return json({error:'No fields'},400);u.push("updated_at=datetime('now')");p.push(id,oid);await env.DB.prepare('UPDATE subscriptions SET '+u.join(', ')+' WHERE id=? AND organization_id=?').bind(...p).run();return json(await env.DB.prepare('SELECT * FROM subscriptions WHERE id=?').bind(id).first())}
async function delSub(env,path,oid,uid,ip){const id=path.split('/')[3];if(!await env.DB.prepare('SELECT * FROM subscriptions WHERE id=? AND organization_id=?').bind(id,oid).first())return json({error:'Not found'},404);await env.DB.prepare('DELETE FROM subscriptions WHERE id=? AND organization_id=?').bind(id,oid).run();return json({success:true})}

async function listInv(env,url,oid){const{page,pp,off}=pg(url);const cnt=await env.DB.prepare('SELECT COUNT(*)t FROM invoices WHERE organization_id=?').bind(oid).first();const rows=await env.DB.prepare('SELECT i.*,c.first_name,c.last_name FROM invoices i LEFT JOIN customers c ON i.customer_id=c.id WHERE i.organization_id=? ORDER BY i.created_at DESC LIMIT? OFFSET?').bind(oid,pp,off).all();return json({data:rows.results||[],pagination:{page,pp,total:cnt.t,totalPages:Math.ceil(cnt.t/pp)}})}
async function createInv(r,env,oid,uid,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ms=vReq(b,['customer_id','amount']);if(ms.length)return json({error:'Missing fields',fields:ms},400);if(!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND organization_id=?').bind(b.customer_id,oid).first())return json({error:'Customer not found'},404);const id=uuid();const amt=parseFloat(b.amount),tax=parseFloat(b.tax||0),total=amt+tax;const cnt=await env.DB.prepare('SELECT COUNT(*)c FROM invoices WHERE organization_id=?').bind(oid).first();const num='INV-'+String(cnt.c+1).padStart(5,'0');const idate=b.issue_date||new Date().toISOString().split('T')[0];let ddate=b.due_date;if(!ddate){const d=new Date(idate);d.setDate(d.getDate()+30);ddate=d.toISOString().split('T')[0]}await env.DB.prepare('INSERT INTO invoices(id,organization_id,customer_id,subscription_id,invoice_number,amount,tax,total,status,issue_date,due_date,notes)VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,oid,b.customer_id,b.subscription_id||null,num,amt,tax,total,'pending',idate,ddate,b.notes||null).run();await audit(env,oid,uid,'create_invoice','Invoice:'+num,ip);return json(await env.DB.prepare('SELECT * FROM invoices WHERE id=?').bind(id).first(),201)}
async function generateBilling(r,env,oid,uid,ip){
 const b=await parseBody(r);if(!b||typeof b.period!=='string'||!/^\\d{4}-(0[1-9]|1[0-2])$/.test(b.period))return json({error:'A valid billing period (YYYY-MM) is required'},400);
 const period=b.period,now=new Date(),currentMonth=now.toISOString().slice(0,7);
 if(period>currentMonth)return json({error:'Future billing periods cannot be generated'},400);
 const [year,month]=period.split('-').map(Number),periodStart=period+'-01';
 const periodEnd=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
 const dueDate=new Date(Date.UTC(year,month-1,8)).toISOString().slice(0,10);
 const eligible=await env.DB.prepare("SELECT s.id AS subscription_id,s.customer_id,p.price FROM subscriptions s JOIN packages p ON p.id=s.package_id AND p.organization_id=s.organization_id JOIN customers c ON c.id=s.customer_id AND c.organization_id=s.organization_id WHERE s.organization_id=? AND s.status='active' AND COALESCE(p.billing_cycle,'monthly')='monthly' AND (s.start_date IS NULL OR s.start_date<=?) AND (s.end_date IS NULL OR s.end_date>=?)").bind(oid,periodEnd,periodStart).all();
 let created=0;
 for(const row of eligible.results||[]){
  const amount=Number(row.price);if(!Number.isSafeInteger(amount)||amount<0)continue;
  const invoiceId=uuid(),invoiceNumber='INV-'+period.replace('-','')+'-'+uuid().slice(0,8).toUpperCase();
  const result=await env.DB.prepare("INSERT OR IGNORE INTO invoices(id,organization_id,customer_id,subscription_id,invoice_number,amount,tax,total,status,issue_date,due_date,notes,billing_period) VALUES(?,?,?,?,?,?,0,?,'pending',?,?,?,?)").bind(invoiceId,oid,row.customer_id,row.subscription_id,invoiceNumber,amount,amount,periodStart,dueDate,'Monthly subscription billing '+period,period).run();
  if(Number(result.meta?.changes||0)>0)created++;
 }
 if(created>0)await audit(env,oid,uid,'generate_monthly_invoices','Period:'+period+'; created:'+created,ip);
 return json({success:true,billingPeriod:period,invoicesCreated:created,subscriptionsEligible:(eligible.results||[]).length,alreadyGenerated:created===0&&(eligible.results||[]).length>0});
}
async function getInv(env,path,oid){const id=path.split('/')[3];const inv=await env.DB.prepare('SELECT i.*,c.first_name,c.last_name,c.email,c.phone FROM invoices i LEFT JOIN customers c ON i.customer_id=c.id WHERE i.id=? AND i.organization_id=?').bind(id,oid).first();if(!inv)return json({error:'Not found'},404);const pays=await env.DB.prepare('SELECT * FROM payments WHERE invoice_id=? AND organization_id=?').bind(id,oid).all();return json({...inv,payments:pays.results})}
async function recPay(r,env,path,oid,uid,ip){const iid=path.split('/')[3];const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ms=vReq(b,['amount']);if(ms.length)return json({error:'Missing fields',fields:ms},400);const inv=await env.DB.prepare('SELECT * FROM invoices WHERE id=? AND organization_id=?').bind(iid,oid).first();if(!inv)return json({error:'Invoice not found'},404);const pid=uuid();const amt=parseFloat(b.amount);await env.DB.prepare('INSERT INTO payments(id,organization_id,invoice_id,customer_id,amount,payment_method,transaction_ref,status,paid_at)VALUES(?,?,?,?,?,?,?,?,?)').bind(pid,oid,iid,inv.customer_id,amt,b.method||'cash',b.reference||null,'completed',b.payment_date||new Date().toISOString().split('T')[0]).run();const tp=await env.DB.prepare("SELECT COALESCE(SUM(amount),0)t FROM payments WHERE invoice_id=? AND organization_id=? AND status='completed'").bind(iid,oid).first();if(tp.t>=inv.total)await env.DB.prepare("UPDATE invoices SET status='paid',paid_at=datetime('now'),updated_at=datetime('now')WHERE id=?").bind(iid).run();await env.DB.prepare("UPDATE customers SET balance=MAX(0,balance-?),updated_at=datetime('now')WHERE id=? AND organization_id=?").bind(amt,inv.customer_id,oid).run();await audit(env,oid,uid,'record_payment','Payment for '+inv.invoice_number,ip);return json(await env.DB.prepare('SELECT * FROM payments WHERE id=?').bind(pid).first(),201)}

async function listPay(env,url,oid){const{page,pp,off}=pg(url);const cnt=await env.DB.prepare('SELECT COUNT(*)t FROM payments WHERE organization_id=?').bind(oid).first();const rows=await env.DB.prepare('SELECT p.*,c.first_name,c.last_name,i.invoice_number FROM payments p LEFT JOIN customers c ON p.customer_id=c.id LEFT JOIN invoices i ON p.invoice_id=i.id WHERE p.organization_id=? ORDER BY p.created_at DESC LIMIT? OFFSET?').bind(oid,pp,off).all();return json({data:rows.results||[],pagination:{page,pp,total:cnt.t,totalPages:Math.ceil(cnt.t/pp)}})}

async function listComp(env,url,oid){const{page,pp,off}=pg(url);const cnt=await env.DB.prepare('SELECT COUNT(*)t FROM support_tickets WHERE organization_id=?').bind(oid).first();const rows=await env.DB.prepare('SELECT t.*,c.first_name,c.last_name FROM support_tickets t LEFT JOIN customers c ON t.customer_id=c.id WHERE t.organization_id=? ORDER BY t.created_at DESC LIMIT? OFFSET?').bind(oid,pp,off).all();return json({data:rows.results||[],pagination:{page,pp,total:cnt.t,totalPages:Math.ceil(cnt.t/pp)}})}
async function createComp(r,env,oid,uid,ip){
 const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);
 const ms=vReq(b,['subject']);if(ms.length)return json({error:'Missing fields',fields:ms},400);
 if(b.customer_id&&!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND organization_id=?').bind(b.customer_id,oid).first())return json({error:'Customer not found'},404);
 if(b.assigned_to&&!await env.DB.prepare('SELECT id FROM users WHERE id=? AND organization_id=?').bind(b.assigned_to,oid).first())return json({error:'Assigned staff not found'},404);
 const id=uuid();
 await env.DB.prepare('INSERT INTO support_tickets(id,organization_id,customer_id,subject,description,priority,status,assigned_to)VALUES(?,?,?,?,?,?,?,?)').bind(id,oid,b.customer_id||null,s(b.subject),b.description||null,b.priority||'medium','open',b.assigned_to||null).run();
 await audit(env,oid,uid,'create_ticket','Ticket:'+b.subject,ip);
 return json(await env.DB.prepare('SELECT * FROM support_tickets WHERE id=? AND organization_id=?').bind(id,oid).first(),201)
}
async function updateComp(r,env,path,oid,uid,ip){const id=path.split('/')[3];const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const ex=await env.DB.prepare('SELECT * FROM support_tickets WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);if(b.customer_id&&!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND organization_id=?').bind(b.customer_id,oid).first())return json({error:'Customer not found'},404);if(b.assigned_to&&!await env.DB.prepare('SELECT id FROM users WHERE id=? AND organization_id=?').bind(b.assigned_to,oid).first())return json({error:'Assigned staff not found'},404);const f=['status','priority','assigned_to','resolution','description'];const u=[],p=[];for(const x of f){if(b[x]!==undefined){u.push(x+'=?');p.push(b[x])}}if(!u.length)return json({error:'No fields'},400);u.push("updated_at=datetime('now')");p.push(id,oid);await env.DB.prepare('UPDATE support_tickets SET '+u.join(', ')+' WHERE id=? AND organization_id=?').bind(...p).run();return json(await env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(id).first())}

async function listStaff(env,oid){const rows=await env.DB.prepare('SELECT id,email,name,role,phone,status,last_login,created_at FROM users WHERE organization_id=? ORDER BY created_at DESC').bind(oid).all();return json({data:rows.results||[]})}
async function createStaff(r,env,oid,uid,role,ip){
 if(role!=='admin')return json({error:'Admin only'},403);
 const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);
 const ms=vReq(b,['email','password','name']);if(ms.length)return json({error:'Missing fields',fields:ms},400);
 if(!vEmail(b.email))return json({error:'Invalid email'},400);
 if(typeof b.password!=='string'||b.password.length<8)return json({error:'Password must be at least 8 characters'},400);
 const allowed=['admin','billing','support','technician','staff'],assigned=b.role||'staff';
 if(!allowed.includes(assigned))return json({error:'Invalid role'},400);
 if(await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(b.email.toLowerCase()).first())return json({error:'Email exists'},409);
 const id=uuid(),{hash,salt}=await hashPw(b.password);
 await env.DB.prepare('INSERT INTO users(id,organization_id,email,password_hash,password_salt,name,role,phone)VALUES(?,?,?,?,?,?,?,?)').bind(id,oid,b.email.toLowerCase(),hash,salt,s(b.name),assigned,b.phone||null).run();
 await audit(env,oid,uid,'create_staff','Staff:'+b.name,ip);
 return json({id,email:b.email,name:b.name,role:assigned},201)
}
async function updateStaff(r,env,path,oid,uid,role,ip){
 if(role!=='admin')return json({error:'Admin only'},403);
 const id=path.split('/')[3],b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);
 const ex=await env.DB.prepare('SELECT * FROM users WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);
 const allowed=['admin','billing','support','technician','staff'];
 if(b.role!==undefined&&!allowed.includes(b.role))return json({error:'Invalid role'},400);
 if(b.password!==undefined&&(typeof b.password!=='string'||b.password.length<8))return json({error:'Password must be at least 8 characters'},400);
 if(b.status!==undefined&&!['active','disabled'].includes(b.status))return json({error:'Invalid user status'},400);
 if(id===uid&&b.role!==undefined&&b.role!==role)return json({error:'You cannot change your own role'},400);
 const fields=['name','role','phone','status'],sets=[],params=[];
 for(const f of fields)if(b[f]!==undefined){sets.push(f+'=?');params.push(b[f])}
 if(b.password){const{hash,salt}=await hashPw(b.password);sets.push('password_hash=?','password_salt=?');params.push(hash,salt)}
 if(!sets.length)return json({error:'No fields'},400);
 sets.push("updated_at=datetime('now')");params.push(id,oid);
 await env.DB.prepare('UPDATE users SET '+sets.join(', ')+' WHERE id=? AND organization_id=?').bind(...params).run();
 await audit(env,oid,uid,'update_staff','Staff:'+id,ip);
 return json(await env.DB.prepare('SELECT id,email,name,role,phone,status,last_login,created_at FROM users WHERE id=? AND organization_id=?').bind(id,oid).first())
}
async function delStaff(env,path,oid,role,uid,ip){if(role!=='admin')return json({error:'Admin only'},403);const id=path.split('/')[3];if(id===uid)return json({error:'Cannot delete self'},400);if(!await env.DB.prepare('SELECT * FROM users WHERE id=? AND organization_id=?').bind(id,oid).first())return json({error:'Not found'},404);await env.DB.prepare('DELETE FROM users WHERE id=? AND organization_id=?').bind(id,oid).run();return json({success:true})}


async function getSub(env,path,oid){
 const id=path.split('/')[3],row=await env.DB.prepare('SELECT s.*,c.first_name,c.last_name,p.name package_name,p.price,p.speed_mbps FROM subscriptions s LEFT JOIN customers c ON s.customer_id=c.id LEFT JOIN packages p ON s.package_id=p.id WHERE s.id=? AND s.organization_id=?').bind(id,oid).first();
 return row?json(row):json({error:'Not found'},404)
}
async function listPppoe(env,url,oid){
 const{page,pp,off}=pg(url),cnt=await env.DB.prepare('SELECT COUNT(*) AS n FROM pppoe_accounts WHERE organization_id=?').bind(oid).first();
 const rows=await env.DB.prepare('SELECT p.id,p.customer_id,p.username,p.ip_address,p.status,p.created_at,p.updated_at,CASE WHEN p.password IS NULL THEN 0 ELSE 1 END AS password_set,c.first_name,c.last_name FROM pppoe_accounts p LEFT JOIN customers c ON p.customer_id=c.id WHERE p.organization_id=? ORDER BY p.created_at DESC LIMIT ? OFFSET ?').bind(oid,pp,off).all();
 return json({data:rows.results||[],pagination:{page,per_page:pp,total:cnt.n,total_pages:Math.ceil(cnt.n/pp)}})
}
async function createPppoe(r,env,oid,uid,ip){
 const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);
 const ms=vReq(b,['customer_id','username','password']);if(ms.length)return json({error:'Missing fields',fields:ms},400);
 if(!s(b.username)||typeof b.password!=='string'||b.password.length<8)return json({error:'Valid username and password of at least 8 characters required'},400);
 if(b.status!==undefined&&!['active','suspended','disabled'].includes(b.status))return json({error:'Invalid status'},400);
 if(!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND organization_id=?').bind(b.customer_id,oid).first())return json({error:'Customer not found'},404);
 if(await env.DB.prepare('SELECT id FROM pppoe_accounts WHERE username=? AND organization_id=?').bind(s(b.username),oid).first())return json({error:'PPPoE username already exists'},409);
 const encrypted=await encryptPppoePassword(b.password,env),id=uuid();
 await env.DB.prepare('INSERT INTO pppoe_accounts(id,organization_id,customer_id,username,password,ip_address,status)VALUES(?,?,?,?,?,?,?)').bind(id,oid,b.customer_id,s(b.username),encrypted,b.ip_address||null,b.status||'active').run();
 await audit(env,oid,uid,'create_pppoe','PPPoE:'+s(b.username),ip);
 return json(await env.DB.prepare('SELECT id,customer_id,username,ip_address,status,created_at,updated_at,1 AS password_set FROM pppoe_accounts WHERE id=? AND organization_id=?').bind(id,oid).first(),201)
}
async function getPppoe(env,path,oid){
 const id=path.split('/')[3],row=await env.DB.prepare('SELECT id,customer_id,username,ip_address,status,created_at,updated_at,CASE WHEN password IS NULL THEN 0 ELSE 1 END AS password_set FROM pppoe_accounts WHERE id=? AND organization_id=?').bind(id,oid).first();
 return row?json(row):json({error:'Not found'},404)
}
async function updatePppoe(r,env,path,oid,uid,ip){
 const id=path.split('/')[3],b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);
 const ex=await env.DB.prepare('SELECT * FROM pppoe_accounts WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);
 if(b.customer_id&&!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND organization_id=?').bind(b.customer_id,oid).first())return json({error:'Customer not found'},404);
 if(b.password!==undefined&&(typeof b.password!=='string'||b.password.length<8))return json({error:'PPPoE password must be at least 8 characters'},400);
 if(b.status!==undefined&&!['active','suspended','disabled'].includes(b.status))return json({error:'Invalid status'},400);
 if(b.username&&await env.DB.prepare('SELECT id FROM pppoe_accounts WHERE username=? AND organization_id=? AND id<>?').bind(s(b.username),oid,id).first())return json({error:'PPPoE username already exists'},409);
 const sets=[],params=[];for(const f of ['customer_id','username','ip_address','status'])if(b[f]!==undefined){sets.push(f+'=?');params.push(f==='username'?s(b[f]):b[f])}
 if(b.password){sets.push('password=?');params.push(await encryptPppoePassword(b.password,env))}
 if(!sets.length)return json({error:'No fields'},400);
 sets.push("updated_at=datetime('now')");params.push(id,oid);
 await env.DB.prepare('UPDATE pppoe_accounts SET '+sets.join(', ')+' WHERE id=? AND organization_id=?').bind(...params).run();
 await audit(env,oid,uid,'update_pppoe','PPPoE:'+id,ip);return await getPppoe(env,'/api/pppoe/'+id,oid)
}
async function delPppoe(env,path,oid,uid,ip){
 const id=path.split('/')[3],r=await env.DB.prepare('DELETE FROM pppoe_accounts WHERE id=? AND organization_id=?').bind(id,oid).run();
 if(!r.meta?.changes)return json({error:'Not found'},404);
 await audit(env,oid,uid,'delete_pppoe','PPPoE:'+id,ip);return json({success:true})
}
async function listNetworkDevices(env,url,oid){
 const{page,pp,off}=pg(url),cnt=await env.DB.prepare('SELECT COUNT(*) AS n FROM network_devices WHERE organization_id=?').bind(oid).first();
 const rows=await env.DB.prepare('SELECT id,name,device_type,host,port,username,status,notes,created_at,updated_at FROM network_devices WHERE organization_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(oid,pp,off).all();
 return json({data:rows.results||[],pagination:{page,per_page:pp,total:cnt.n,total_pages:Math.ceil(cnt.n/pp)}})
}
async function createNetworkDevice(r,env,oid,uid,ip){
 const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);
 const name=s(b.name),type=b.device_type||b.type,port=b.port===undefined||b.port===null||b.port===''?null:parseInt(b.port,10);
 if(!name||!['mikrotik','olt','acs','other'].includes(type))return json({error:'name and valid device_type are required'},400);
 if(port!==null&&(!Number.isInteger(port)||port<1||port>65535))return json({error:'port must be between 1 and 65535'},400);
 if(b.status!==undefined&&!['active','inactive','maintenance'].includes(b.status))return json({error:'Invalid status'},400);
 const id=uuid();
 await env.DB.prepare('INSERT INTO network_devices(id,organization_id,name,device_type,host,port,username,status,notes)VALUES(?,?,?,?,?,?,?,?,?)').bind(id,oid,name,type,b.host||null,port,b.username||null,b.status||'inactive',b.notes||null).run();
 await audit(env,oid,uid,'create_network_device',type+':'+name,ip);
 return json(await env.DB.prepare('SELECT * FROM network_devices WHERE id=? AND organization_id=?').bind(id,oid).first(),201)
}
async function getNetworkDevice(env,path,oid){
 const id=path.split('/')[4],row=await env.DB.prepare('SELECT * FROM network_devices WHERE id=? AND organization_id=?').bind(id,oid).first();
 return row?json(row):json({error:'Not found'},404)
}
async function updateNetworkDevice(r,env,path,oid,uid,ip){
 const id=path.split('/')[4],b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);
 const ex=await env.DB.prepare('SELECT id FROM network_devices WHERE id=? AND organization_id=?').bind(id,oid).first();if(!ex)return json({error:'Not found'},404);
 const sets=[],params=[];for(const f of ['name','host','port','username','status','notes'])if(b[f]!==undefined){sets.push(f+'=?');params.push(f==='port'&&b[f]!==null&&b[f]!==''?parseInt(b[f],10):b[f])}
 if(b.device_type!==undefined){if(!['mikrotik','olt','acs','other'].includes(b.device_type))return json({error:'Invalid device_type'},400);sets.push('device_type=?');params.push(b.device_type)}
 if(b.status!==undefined&&!['active','inactive','maintenance'].includes(b.status))return json({error:'Invalid status'},400);
 if(!sets.length)return json({error:'No fields'},400);
 sets.push("updated_at=datetime('now')");params.push(id,oid);
 await env.DB.prepare('UPDATE network_devices SET '+sets.join(', ')+' WHERE id=? AND organization_id=?').bind(...params).run();
 await audit(env,oid,uid,'update_network_device','Device:'+id,ip);return await getNetworkDevice(env,'/api/network/devices/'+id,oid)
}
async function delNetworkDevice(env,path,oid,uid,ip){
 const id=path.split('/')[4],r=await env.DB.prepare('DELETE FROM network_devices WHERE id=? AND organization_id=?').bind(id,oid).run();
 if(!r.meta?.changes)return json({error:'Not found'},404);
 await audit(env,oid,uid,'delete_network_device','Device:'+id,ip);return json({success:true})
}
async function networkStatus(env,oid){
 const rows=await env.DB.prepare('SELECT status,COUNT(*) AS n FROM network_devices WHERE organization_id=? GROUP BY status').bind(oid).all();
 const counts={active:0,inactive:0,maintenance:0};for(const row of rows.results||[])counts[row.status]=row.n;
 return json({configured:Object.values(counts).reduce((a,b)=>a+b,0)>0,devices:counts,connection_tested:false,note:'Device inventory is configured; live router/OLT connectivity requires reachable management endpoints and credentials.'})
}

async function repRev(env,url,oid){const months=parseInt(url.searchParams.get('months')||'6');const rows=await env.DB.prepare("SELECT strftime('%Y-%m',paid_at)m,COUNT(*)c,COALESCE(SUM(amount),0)t FROM payments WHERE organization_id=? AND status='completed'AND paid_at>=datetime('now',?)GROUP BY m ORDER BY m").bind(oid,'-'+months+' months').all();return json({data:rows.results||[]})}
async function repCust(env,oid){const bs=await env.DB.prepare('SELECT status,COUNT(*)c FROM customers WHERE organization_id=? GROUP BY status').bind(oid).all();return json({byStatus:bs.results||[]})}
async function repSubs(env,oid){const bs=await env.DB.prepare('SELECT status,COUNT(*)c FROM subscriptions WHERE organization_id=? GROUP BY status').bind(oid).all();const bp=await env.DB.prepare('SELECT p.name package_name,COUNT(s.id)c FROM packages p LEFT JOIN subscriptions s ON p.id=s.package_id AND s.organization_id=? WHERE p.organization_id=? GROUP BY p.id').bind(oid,oid).all();return json({byStatus:bs.results||[],byPackage:bp.results||[]})}
async function listAudit(env,url,oid){const{page,pp,off}=pg(url,50);const cnt=await env.DB.prepare('SELECT COUNT(*)t FROM audit_log WHERE organization_id=?').bind(oid).first();const rows=await env.DB.prepare('SELECT a.*,u.name user_name FROM audit_log a LEFT JOIN users u ON a.user_id=u.id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT? OFFSET?').bind(oid,pp,off).all();return json({data:rows.results||[],pagination:{page,pp,total:cnt.t,totalPages:Math.ceil(cnt.t/pp)}})}
async function getSet(env,oid){const rows=await env.DB.prepare('SELECT key,value FROM settings WHERE organization_id=?').bind(oid).all();const s={};for(const r of rows.results||[])s[r.key]=r.value;return json(s)}
async function updSet(r,env,oid,uid,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);for(const[k,v]of Object.entries(b)){const ex=await env.DB.prepare('SELECT id FROM settings WHERE organization_id=? AND key=?').bind(oid,k).first();if(ex)await env.DB.prepare("UPDATE settings SET value=?,updated_at=datetime('now')WHERE id=?").bind(String(v),ex.id).run();else await env.DB.prepare('INSERT INTO settings(id,organization_id,key,value)VALUES(?,?,?,?)').bind(uuid(),oid,k,String(v)).run()}await audit(env,oid,uid,'update_settings','Settings updated',ip);return json({success:true})}
async function getProf(env,auth){const u=await env.DB.prepare('SELECT id,email,name,role,phone,status FROM users WHERE id=?').bind(auth.userId).first();return json(u||{error:'Not found'},u?200:404)}
async function updProf(r,env,auth,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const f=['name','phone'];const u=[],p=[];for(const x of f){if(b[x]!==undefined){u.push(x+'=?');p.push(b[x])}}if(!u.length)return json({error:'No fields'},400);u.push("updated_at=datetime('now')");p.push(auth.userId);await env.DB.prepare('UPDATE users SET '+u.join(', ')+' WHERE id=?').bind(...p).run();return json(await env.DB.prepare('SELECT id,email,name,role,phone,status FROM users WHERE id=?').bind(auth.userId).first())}
async function chgPw(r,env,auth,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);if(!b.currentPassword||!b.newPassword)return json({error:'Both passwords required'},400);if(b.newPassword.length<8)return json({error:'Password must be at least 8 characters'},400);const u=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(auth.userId).first();if(!await verifyPw(b.currentPassword,u.password_hash,u.password_salt))return json({error:'Current password incorrect'},401);const{hash,salt}=await hashPw(b.newPassword);await env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,updated_at=datetime('now')WHERE id=?").bind(hash,salt,auth.userId).run();return json({success:true,message:'Password changed'})}
async function getCo(env,oid){const o=await env.DB.prepare('SELECT id,name,slug,email,phone,address,logo,currency,plan,created_at FROM organizations WHERE id=?').bind(oid).first();return json(o||{error:'Not found'},o?200:404)}
async function updCo(r,env,oid,uid,ip){const b=await parseBody(r);if(!b)return json({error:'Invalid body'},400);const f=['name','email','phone','address','logo','currency'];const u=[],p=[];for(const x of f){if(b[x]!==undefined){u.push(x+'=?');p.push(b[x])}}if(!u.length)return json({error:'No fields'},400);u.push("updated_at=datetime('now')");p.push(oid);await env.DB.prepare('UPDATE organizations SET '+u.join(', ')+' WHERE id=?').bind(...p).run();await audit(env,oid,uid,'update_company','Company updated',ip);return json(await env.DB.prepare('SELECT id,name,slug,email,phone,address,logo,currency,plan,created_at FROM organizations WHERE id=?').bind(oid).first())}

