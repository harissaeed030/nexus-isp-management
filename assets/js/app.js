(() => {
const $=(s,r=document)=>r.querySelector(s),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let api=(()=>{const local=["localhost","127.0.0.1"].includes(location.hostname),saved=sessionStorage.getItem("nexus_api");if(saved&&(local||!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(saved)))return saved;if(saved&&!local)sessionStorage.removeItem("nexus_api");return location.port==="4000"?location.origin:(local?"http://127.0.0.1:4000":"https://nexus-saas-api.harissaeed030.workers.dev")})(),token=sessionStorage.getItem("nexus_token")||"",view="dashboard";
const shell=$(".app-shell"),content=$(".content"),toast=$("#toast");
const st=document.createElement("style");st.textContent=".nx-auth{position:fixed;inset:0;z-index:99;background:#f4f8f6;display:grid;place-items:center;padding:18px}.nx-card,.nx-panel,.nx-kpi{background:white;border:1px solid #e5eeea;border-radius:12px;padding:16px;margin:12px 0}.nx-card{width:min(100%,430px);padding:24px}.nx-form,.nx-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.nx-form{display:grid}.nx-form input,.nx-row input,.nx-row select{padding:10px;border:1px solid #dce7e2;border-radius:7px;min-width:120px}.nx-btn{border:0;border-radius:7px;background:#137e62;color:white;padding:10px 14px;font-weight:700}.nx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.nx-kpi small{display:block;color:#82918e}.nx-kpi b{font-size:22px}.nx-table{border-collapse:collapse;width:100%;min-width:520px}.nx-table th,.nx-table td{text-align:left;padding:10px;border-bottom:1px solid #edf2ef;font-size:11px}.nx-table th{color:#82918e;font-size:9px}@media(max-width:650px){.nx-grid{grid-template-columns:repeat(2,1fr)}}.nx-customer-name{border:0;background:transparent;color:#287fb4;font:700 12px Arial;padding:2px 0;cursor:pointer;text-align:left}.nx-customer-name span{color:#87949b;margin-left:5px}.nx-customer-menu{position:relative;z-index:3;background:#fff;border:1px solid #e1e9ed;border-radius:8px;box-shadow:0 8px 24px #20374418;padding:5px;margin-top:7px;min-width:190px}.nx-customer-menu[hidden]{display:none}.nx-customer-menu button{display:block;width:100%;text-align:left;border:0;background:#fff;padding:9px 10px;border-radius:5px;color:#42545d;font-size:11px;cursor:pointer}.nx-customer-menu button:hover{background:#f0f6fa;color:#1684c4}.nx-customer-menu button.danger{color:#c34f4f}.nx-customer-overlay{position:fixed;inset:0;background:#142a3580;z-index:120;display:grid;place-items:center;padding:16px}.nx-customer-dialog{width:min(100%,620px);max-height:85vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 20px 70px #102b3a40}.nx-customer-dialog-head{position:sticky;top:0;background:#fff;padding:15px 18px;border-bottom:1px solid #e8edf0;display:flex;justify-content:space-between;align-items:center}.nx-customer-dialog-head button{border:0;background:#f2f5f7;border-radius:6px;font-size:20px;width:30px;height:30px}.nx-customer-dialog-body{padding:16px}.nx-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.nx-detail-grid div{background:#f6f8fa;border-radius:7px;padding:11px}.nx-detail-grid small,.nx-detail-grid b{display:block}.nx-detail-grid small{font-size:9px;color:#819099;margin-bottom:5px}.nx-detail-grid b{font-size:12px;overflow-wrap:anywhere}";document.head.append(st);
function msg(t){if(toast){toast.textContent=t;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2400)}}
async function call(path,opt={}){
 const original=path,method=String(opt.method||"GET").toUpperCase();
 if(original==="/api/v1/billing/generate")throw Error("Monthly invoice generation abhi Worker API mein available nahi; invoices manually create karein.");
 const routeMap={"/api/v1/setup":"/api/auth/register","/api/v1/auth/login":"/api/auth/login","/api/v1/auth/me":"/api/auth/me","/api/v1/auth/logout":"/api/auth/logout","/api/v1/dashboard":"/api/dashboard/stats","/api/v1/reports/summary":"/api/reports/revenue","/api/v1/tickets":"/api/complaints","/api/v1/routers":"/api/network/devices"};
 let target=routeMap[original]||original.replace(/^\/api\/v1\//,"/api/");
 if(original.startsWith("/api/v1/tickets/"))target=original.replace("/api/v1/tickets/","/api/complaints/");
 if(original.startsWith("/api/v1/routers/"))target=original.replace("/api/v1/routers/","/api/network/devices/");
 let sendMethod=method==="PATCH"?"PUT":method,body=null;
 if(opt.body){try{body=JSON.parse(opt.body)}catch{body={}}}
 const snake=o=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k.replace(/[A-Z]/g,x=>"_"+x.toLowerCase()),v]));
 if(original==="/api/v1/setup"){const full=String(body.fullName||"").trim().split(/\s+/);body={companyName:body.companyName,slug:String(body.companyName||"nexus").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),email:body.email,password:body.password,name:full.join(" ")}}
 else if((original==="/api/v1/customers"||original.startsWith("/api/v1/customers/"))&&body!==null){body=snake(body);if(body.full_name){const p=String(body.full_name).trim().split(/\s+/);body.first_name=p.shift()||"";body.last_name=p.join(" ");delete body.full_name}if(body.fullName){const p=String(body.fullName).trim().split(/\s+/);body.first_name=p.shift()||"";body.last_name=p.join(" ");delete body.fullName}}
 else if((original==="/api/v1/packages"||original.startsWith("/api/v1/packages/"))&&body!==null){body=snake(body);if(body.speed_down_mbps!==undefined){body.speed_down=body.speed_down_mbps;body.speed_mbps=body.speed_down_mbps;delete body.speed_down_mbps}if(body.speed_up_mbps!==undefined){body.speed_up=body.speed_up_mbps;delete body.speed_up_mbps}if(body.monthly_price_pkr!==undefined){body.price=body.monthly_price_pkr;delete body.monthly_price_pkr}}
 else if(original.startsWith("/api/v1/subscriptions")&&body!==null)body=snake(body);
 else if(original==="/api/v1/invoices"&&body!==null){body=snake(body);if(body.amount_pkr!==undefined){body.amount=body.amount_pkr;delete body.amount_pkr}}
 else if(original.startsWith("/api/v1/tickets")&&body!==null){body=snake(body);if(body.priority==="normal")body.priority="medium"}
 else if(original.startsWith("/api/v1/routers")&&body!==null){body=snake(body);body.device_type="mikrotik";if(body.api_port!==undefined){body.port=body.api_port;delete body.api_port}body.notes=[body.location,body.notes].filter(Boolean).join(" | ")||null;delete body.location;if(body.status==="configured")body.status="active"}
 else if(original.startsWith("/api/v1/staff")&&body!==null){body=snake(body);if(body.full_name){body.name=body.full_name;delete body.full_name}if(body.role==="noc")body.role="technician"}
 else if(original==="/api/v1/payments"&&method==="POST"){target="/api/invoices/"+encodeURIComponent(body.invoiceId)+"/payments";body=snake(body);if(body.amount_pkr!==undefined){body.amount=body.amount_pkr;delete body.amount_pkr}delete body.invoice_id}
 const headers={"Content-Type":"application/json",...(opt.headers||{})};if(token)headers.Authorization="Bearer "+token;
 const fetchOne=async(p,m,b)=>{let res;try{res=await fetch(api.replace(/\/$/,"")+p,{method:m,headers,body:b===null?undefined:JSON.stringify(b)})}catch{throw Error("API connect nahi hua. Worker URL aur internet check karein.")}const data=await res.json().catch(()=>({error:"Invalid server response"}));if(!res.ok)throw Error((data.error||("API error "+res.status))+(Array.isArray(data.fields)&&data.fields.length?": "+data.fields.join(", "):""));return data};
 let d;
 if(original==="/api/v1/reports/summary"){const [rev,stats,invoices]=await Promise.all([fetchOne("/api/reports/revenue","GET",null),fetchOne("/api/dashboard/stats","GET",null),fetchOne("/api/invoices","GET",null)]);const counts={};(invoices.data||[]).forEach(x=>{const k=x.status||"unknown";counts[k]=(counts[k]||0)+1});d={data:{monthlyRevenue:(rev.data||[]).map(x=>({month:x.m,revenue:x.t})),outstandingPkr:stats.pendingAmount||0,revenuePkr:stats.totalRevenue||0,invoiceCounts:Object.entries(counts).map(([status,count])=>({status,count}))}}}
 else d=await fetchOne(target,sendMethod,body);
 const customerName=x=>[x.first_name,x.last_name].filter(Boolean).join(" ")||x.name||"";
 const normalise=x=>{if(!x||typeof x!=="object")return x;const y={...x};if(y.first_name!==undefined||y.last_name!==undefined){y.full_name=customerName(y);y.customer_name=customerName(y)}if(y.speed_down!==undefined||y.speed_mbps!==undefined)y.speed_down_mbps=Number(y.speed_down||y.speed_mbps||0);if(y.speed_up!==undefined||y.speed_mbps!==undefined)y.speed_up_mbps=Number(y.speed_up||y.speed_mbps||0);if(y.price!==undefined)y.monthly_price_pkr=Number(y.price);if(y.is_active!==undefined)y.status=y.is_active?"active":"inactive";if(y.total!==undefined||y.amount!==undefined)y.amount_pkr=Number(y.total??y.amount);if(y.payment_method!==undefined)y.method=y.payment_method;if(y.paid_at!==undefined||y.created_at!==undefined)y.received_at=y.paid_at||y.created_at;if(y.name!==undefined&&y.role!==undefined)y.full_name=y.name;if(y.port!==undefined)y.api_port=y.port;if(y.notes!==undefined&&y.device_type!==undefined)y.location=y.notes;if(y.detail!==undefined){y.resource_type="activity";y.resource_id=y.detail}return y};
 if(original==="/api/v1/dashboard")d={...d,stats:{customers:d.customers||0,activeCustomers:d.activeCustomers||0,revenuePkr:d.totalRevenue||0}};
 if(original==="/api/v1/auth/me")return d;
 if(Array.isArray(d.data))d.data=d.data.map(normalise);else if(d.data&&typeof d.data==="object")d.data=normalise(d.data);else if(d.id&&original.startsWith("/api/v1/"))d={...d,data:normalise(d)};
 if(d.user&&d.user.name&&!d.user.full_name)d.user.full_name=d.user.name;
 return d;
}
function auth(setup=false){let p=$("#nxAuth");if(!p){p=document.createElement("div");p.id="nxAuth";p.className="nx-auth";document.body.append(p)}if(shell)shell.style.display="none";p.innerHTML='<div class="nx-card"><h1>NEXUS</h1><p>ISP Management · Local workspace</p><form id="nxLogin" class="nx-form"><label>API address<input name="api" required value="'+esc(api)+'"></label>'+(setup?'<label>Company<input name="companyName" required value="Vancom Networks"></label><label>Owner name<input name="fullName" required></label>':'')+'<label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required minlength="'+(setup?10:1)+'"></label><button class="nx-btn">'+(setup?"Create owner account":"Sign in")+'</button></form><p id="nxErr" style="color:#b64e3b"></p><button id="nxToggle" class="nx-btn" type="button">'+(setup?"Back to sign in":"First time? Set up Nexus")+'</button><p>Password private rakhein; chat mein share na karein.</p></div>';$("#nxToggle").onclick=()=>auth(!setup);$("#nxLogin").onsubmit=async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget));api=b.api.replace(/\/+$/,"");try{let d=await call(setup?"/api/v1/setup":"/api/v1/auth/login",{method:"POST",body:JSON.stringify(b)});token=d.token;sessionStorage.setItem("nexus_token",token);sessionStorage.setItem("nexus_api",api);p.remove();shell.style.display="";load("dashboard")}catch(x){$("#nxErr").textContent=x.message}}}
const money=n=>"₨ "+Number(n||0).toLocaleString("en-PK");
function table(head,rows){return '<div class="nx-panel" style="overflow:auto"><table class="nx-table"><thead><tr>'+head.map(x=>"<th>"+x+"</th>").join("")+'</tr></thead><tbody>'+(rows||'<tr><td colspan="'+head.length+'">No records found.</td></tr>')+'</tbody></table></div>'}
function showCustomerPanel(title,body){content.querySelector("#nxCustomerPanel")?.remove();content.insertAdjacentHTML("beforeend",'<div class="nx-customer-overlay" id="nxCustomerPanel"><section class="nx-customer-dialog"><div class="nx-customer-dialog-head"><b>'+esc(title)+'</b><button type="button" id="nxCustomerClose">×</button></div><div class="nx-customer-dialog-body">'+body+'</div></section></div>');$("#nxCustomerClose").onclick=()=>$("#nxCustomerPanel").remove();$("#nxCustomerPanel").onclick=e=>{if(e.target.id==="nxCustomerPanel")e.currentTarget.remove()}}
function page(title,sub,body){
 const exports={customers:"customers",packages:"packages",subscriptions:"subscriptions",billing:"invoices",tickets:"tickets",routers:"routers"};
 const resource=exports[view];
 content.innerHTML='<div class="page-heading"><div><p class="eyebrow">NEXUS WORKSPACE</p><h1>'+title+'</h1><p class="subheading">'+sub+'</p></div><div class="nx-row"><button class="nx-btn" id="nxRefresh">Refresh</button>'+(resource?'<button class="nx-btn" id="nxExport">Export CSV</button>':'')+'</div></div>'+body;
 $("#nxRefresh").onclick=()=>load(view);
 if(resource)$("#nxExport").onclick=async()=>{
  try{
   const response=await fetch(api.replace(/\/$/,"")+"/api/v1/exports/"+resource+".csv",{headers:{Authorization:"Bearer "+token}});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||"CSV export failed")}
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
   link.href=url;link.download="nexus-"+resource+"-"+new Date().toISOString().slice(0,10)+".csv";
   document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);msg("CSV export downloaded");
  }catch(error){msg(error.message)}
 };
}
async function load(v){view=v;try{
if(v==="dashboard"){
 const settled=await Promise.allSettled([
  call("/api/v1/dashboard"),call("/api/v1/reports/summary"),
  call("/api/v1/subscriptions"),call("/api/v1/invoices"),
  call("/api/v1/payments"),call("/api/v1/tickets"),
  call("/api/v1/customers"),call("/api/v1/reports/customers"),
  call("/api/v1/reports/subscriptions"),call("/api/v1/audit-logs")
 ]);
 if(settled[0].status!=="fulfilled") throw settled[0].reason;
 const stats=settled[0].value.stats||{};
 const report=settled[1].status==="fulfilled"?settled[1].value.data:{monthlyRevenue:[],outstandingPkr:0};
 const subscriptions=settled[2].status==="fulfilled"?settled[2].value.data:[];
 const invoices=settled[3].status==="fulfilled"?settled[3].value.data:[];
 const payments=settled[4].status==="fulfilled"?settled[4].value.data:[];
 const tickets=settled[5].status==="fulfilled"?settled[5].value.data:[];
 const customers=settled[6].status==="fulfilled"?settled[6].value.data:[];
 const customerReport=settled[7].status==="fulfilled"?settled[7].value:{byStatus:[]};
 const subscriptionReport=settled[8].status==="fulfilled"?settled[8].value:{byStatus:[]};
 const audit=settled[9].status==="fulfilled"?settled[9].value.data:[];
 const statusCount=(key)=>Number((customerReport.byStatus||[]).find(x=>String(x.status||"").toLowerCase()===key)?.c||0);
 const subCount=(key)=>Number((subscriptionReport.byStatus||[]).find(x=>String(x.status||"").toLowerCase()===key)?.c||0);
 const activeSubs=subCount("active");
 const suspended=statusCount("suspended");
 const offline=statusCount("offline");
 const inactive=statusCount("inactive");
 const today=new Date().toISOString().slice(0,10);
 const todayPayments=payments.filter(x=>String(x.received_at||"").slice(0,10)===today);
 const todayCollection=todayPayments.reduce((sum,x)=>sum+Number(x.amount_pkr||0),0);
 const dueInvoices=invoices.filter(x=>x.status!=="paid").sort((a,b)=>String(a.due_date||"").localeCompare(String(b.due_date||"")));
 const openTickets=tickets.filter(x=>["open","in_progress"].includes(x.status));
 const months=Array.isArray(report.monthlyRevenue)?report.monthlyRevenue.slice(-6):[];
 const maxRevenue=Math.max(1,...months.map(x=>Number(x.revenue)||0));
 const bars=months.map(x=>'<div class="was-bar-col"><b>'+money(x.revenue)+'</b><i style="height:'+Math.max(3,Math.round((Number(x.revenue)||0)/maxRevenue*100))+'%"></i><small>'+esc(x.month)+'</small></div>').join("");
 const paymentRows=payments.slice(0,6).map(x=>'<tr><td>'+esc(x.customer_name||"—")+'</td><td>'+money(x.amount_pkr)+'</td><td>'+esc(x.method||"—")+'</td><td>'+esc(x.received_at||"—")+'</td></tr>').join("");
 const customerRows=customers.slice(0,6).map(x=>'<tr><td>'+esc(x.full_name||"—")+'</td><td>'+esc(x.phone||"—")+'</td><td>'+esc(x.status||"—")+'</td><td>'+esc(x.created_at||"—")+'</td></tr>').join("");
 const complaintRows=openTickets.slice(0,6).map(x=>'<tr><td>'+esc(x.customer_name||"—")+'</td><td>'+esc(x.subject||"—")+'</td><td>'+esc(x.priority||"medium")+'</td><td>'+esc(x.status||"open")+'</td></tr>').join("");
 const activityRows=audit.slice(0,7).map(x=>'<div class="nx-activity-item"><span class="nx-activity-dot"></span><div><b>'+esc(String(x.action||"Activity").replace(/_/g," "))+'</b><small>'+esc(x.user_name||"Workspace user")+' · '+esc(x.created_at||"")+'</small></div></div>').join("");
 const dueRows=dueInvoices.slice(0,6).map(x=>'<tr><td>'+esc(x.customer_name||"—")+'</td><td>'+esc(x.invoice_number||"—")+'</td><td>'+esc(x.due_date||"—")+'</td><td>'+money(x.amount_pkr)+'</td><td>'+esc(x.status||"pending")+'</td></tr>').join("");
 const tableOrEmpty=(headers,rows,label)=>rows?table(headers,rows):'<div class="was-empty">'+label+'</div>';
 const kpi=(label,value,note,icon,kind)=>'<article class="nx-exec-kpi"><div class="nx-kpi-top"><span>'+label+'</span><i class="'+kind+'">'+icon+'</i></div><b>'+value+'</b><small>'+note+'</small></article>';
 page("Dashboard","Executive overview · figures are loaded from your authenticated NEXUS workspace.",'<div class="nx-exec-grid">'+
 kpi("Total customers",Number(stats.customers||0).toLocaleString("en-PK"),"Registered customer accounts","♙","kpi-blue")+
 kpi("Active customers",Number(stats.activeCustomers||0).toLocaleString("en-PK"),"Customer status: active","●","kpi-green")+
 kpi("Offline customers",offline?offline.toLocaleString("en-PK"):(inactive?inactive.toLocaleString("en-PK"):"Not tracked"),offline?"Reported offline status":(inactive?"Inactive status · not live connectivity":"Live online status is not exposed by API"),"⌁","kpi-slate")+
 kpi("Suspended customers",suspended.toLocaleString("en-PK"),"Reported suspended status","⊘","kpi-amber")+
 kpi("Monthly revenue",money(stats.revenuePkr),"Recorded completed payments","₨","kpi-violet")+
 kpi("Pending payments",money(stats.pendingAmount),"Invoices awaiting payment · "+Number(stats.pendingInvoices||0)+" invoices","◷","kpi-amber")+
 kpi("Today's collections",money(todayCollection),todayPayments.length+" recorded payments today","↗","kpi-green")+
 kpi("Monthly expenses","Not tracked","No expense endpoint is configured","−","kpi-slate")+
 kpi("Active subscriptions",activeSubs.toLocaleString("en-PK"),"Active subscription records","⌁","kpi-blue")+
 kpi("Open complaints",Number(stats.openComplaints||openTickets.length).toLocaleString("en-PK"),"Open support tickets","!","kpi-rose")+
 '</div>'+
 '<div class="nx-dashboard-grid"><section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>Revenue analytics</h3><p>Monthly payments received · PKR</p></div><span class="nx-live-label">LIVE API DATA</span></div><div class="was-bars nx-revenue-bars">'+(bars||'<div class="was-empty">No monthly payment records available yet.</div>')+'</div></section>'+
 '<section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>Customer status</h3><p>Counts reported by the customer status API</p></div></div><div class="nx-status-list"><div><span><i class="status-active"></i>Active</span><b>'+Number(stats.activeCustomers||0)+'</b></div><div><span><i class="status-suspended"></i>Suspended</span><b>'+suspended+'</b></div><div><span><i class="status-inactive"></i>Inactive</span><b>'+inactive+'</b></div><div><span><i class="status-offline"></i>Offline</span><b>'+(offline?offline:"Not tracked")+'</b></div></div><p class="nx-data-note">Online/offline reachability requires a live network session integration; customer status is not a substitute.</p></section></div>'+
 '<section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>Pending invoices</h3><p>Outstanding balances requiring follow-up</p></div><a href="#billing" class="nx-inline-link" data-go="billing">Open billing</a></div>'+tableOrEmpty(["CUSTOMER","INVOICE","DUE DATE","AMOUNT","STATUS"],dueRows,"No pending invoices found.")+'</section>'+
 '<div class="nx-section-grid"><section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>Recent payments</h3><p>Latest recorded collections</p></div><a href="#billing" class="nx-inline-link" data-go="billing">View ledger</a></div>'+tableOrEmpty(["CUSTOMER","AMOUNT","METHOD","RECEIVED"],paymentRows,"No payment records available.")+'</section>'+
 '<section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>Recent registrations</h3><p>Latest customer records returned by the API</p></div><a href="#customers" class="nx-inline-link" data-go="customers">View customers</a></div>'+tableOrEmpty(["CUSTOMER","PHONE","STATUS","CREATED"],customerRows,"No customer registrations available.")+'</section></div>'+
 '<div class="nx-section-grid"><section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>Latest complaints</h3><p>Open and in-progress support tickets</p></div><a href="#tickets" class="nx-inline-link" data-go="tickets">View support</a></div>'+tableOrEmpty(["CUSTOMER","SUBJECT","PRIORITY","STATUS"],complaintRows,"No open complaints found.")+'</section>'+
 '<section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>System activity</h3><p>Recent audit log events</p></div><a href="#audit" class="nx-inline-link" data-go="audit">View activity</a></div><div class="nx-activity-list">'+(activityRows||'<div class="was-empty">No activity events are available.</div>')+'</div></section></div>'+
 '<section class="was-panel nx-dashboard-panel"><div class="nx-panel-head"><div><h3>Customer growth</h3><p>Historical monthly registrations</p></div></div><div class="was-empty">Customer growth history is not currently provided by the existing API. No estimated or fabricated chart is displayed.</div></section>');
 content.querySelectorAll("[data-go]").forEach(link=>link.addEventListener("click",event=>{event.preventDefault();load(link.dataset.go)}));
}if(v==="customers"){
 let d=(await call("/api/v1/customers")).data;
 const rows=d.map(x=>'<tr class="nx-customer-row"><td><button type="button" class="nx-customer-name" data-customer-open="'+esc(x.id)+'">'+esc(x.full_name)+' <span>⌄</span></button><div class="nx-customer-menu" id="customer-menu-'+esc(x.id)+'" hidden><button data-customer-action="details" data-id="'+esc(x.id)+'">Customer details</button><button data-customer-action="edit" data-id="'+esc(x.id)+'">Edit customer</button><button data-customer-action="subscriptions" data-id="'+esc(x.id)+'">Subscriptions / package</button><button data-customer-action="billing" data-id="'+esc(x.id)+'">Invoices & payments</button><button data-customer-action="tickets" data-id="'+esc(x.id)+'">Complaints</button><button data-customer-action="status" data-id="'+esc(x.id)+'">'+(x.status==="active"?"Suspend customer":"Activate customer")+'</button><button class="danger" data-customer-action="delete" data-id="'+esc(x.id)+'">Delete customer</button></div></td><td>'+esc(x.customer_code)+'</td><td>'+esc(x.phone||"—")+'</td><td>'+esc(x.email||"—")+'</td><td>'+esc(x.status)+'</td></tr>').join("");
 page("Customers","Customer ke naam par click karein — tamam options usi customer ke neeche khulenge.",'<form id="nxAdd" class="nx-panel nx-row"><input name="fullName" required placeholder="Full name"><input name="phone" placeholder="Phone"><input name="email" type="email" placeholder="Email"><input name="address" placeholder="Address"><button class="nx-btn">Add customer</button></form>'+table(["CUSTOMER / OPTIONS","CODE","PHONE","EMAIL","STATUS"],rows));
 content.querySelectorAll("[data-customer-open]").forEach(b=>b.onclick=()=>{const id=b.dataset.customerOpen,menu=$("#customer-menu-"+CSS.escape(id));const wasOpen=!menu.hidden;content.querySelectorAll(".nx-customer-menu").forEach(m=>m.hidden=true);menu.hidden=wasOpen;b.querySelector("span").textContent=wasOpen?"⌄":"⌃"});
 content.querySelectorAll("[data-customer-action]").forEach(b=>b.onclick=async()=>{
  const id=b.dataset.id,action=b.dataset.customerAction;
  try{
   if(action==="status"){const x=(await call("/api/v1/customers/"+id)).data;const status=x.status==="active"?"inactive":"active";if(!confirm((status==="inactive"?"Suspend":"Activate")+" "+x.full_name+"?"))return;await call("/api/v1/customers/"+id,{method:"PATCH",body:JSON.stringify({status})});msg("Customer status updated");return load("customers")}
   if(action==="delete"){const x=(await call("/api/v1/customers/"+id)).data;if(!confirm("Delete "+x.full_name+"? This cannot be undone."))return;await call("/api/v1/customers/"+id,{method:"DELETE"});msg("Customer deleted");return load("customers")}
   if(action==="details"){const x=(await call("/api/v1/customers/"+id)).data;showCustomerPanel("Customer details",'<div class="nx-detail-grid">'+[["Customer ID",x.customer_code],["Name",x.full_name],["Phone",x.phone],["Email",x.email],["Address",x.address],["Status",x.status],["Joined",x.created_at]].map(y=>'<div><small>'+y[0]+'</small><b>'+esc(y[1]||"—")+'</b></div>').join("")+'</div>');return}
   if(action==="edit"){const x=(await call("/api/v1/customers/"+id)).data;showCustomerPanel("Edit customer",'<form id="nxCustomerEdit" class="nx-form"><input name="fullName" required value="'+esc(x.full_name)+'" placeholder="Full name"><input name="phone" value="'+esc(x.phone||"")+'" placeholder="Phone"><input name="email" type="email" value="'+esc(x.email||"")+'" placeholder="Email"><input name="address" value="'+esc(x.address||"")+'" placeholder="Address"><select name="status"><option value="active" '+(x.status==="active"?"selected":"")+'>Active</option><option value="inactive" '+(x.status==="inactive"?"selected":"")+'>Inactive</option><option value="blocked" '+(x.status==="blocked"?"selected":"")+'>Blocked</option></select><button class="nx-btn">Save changes</button></form>');$("#nxCustomerEdit").onsubmit=async e=>{e.preventDefault();try{await call("/api/v1/customers/"+id,{method:"PATCH",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});msg("Customer updated");load("customers")}catch(err){msg(err.message)}};return}
   const endpoints={subscriptions:"/api/v1/subscriptions",billing:"/api/v1/invoices",tickets:"/api/v1/tickets"};
   const data=(await call(endpoints[action])).data;
   if(action==="subscriptions"){const list=data.filter(x=>x.customer_id===id);showCustomerPanel("Customer subscriptions",table(["PACKAGE","SPEED","MONTHLY FEE","STATUS"],list.map(x=>'<tr><td>'+esc(x.package_name)+'</td><td>'+x.speed_down_mbps+'/'+x.speed_up_mbps+' Mbps</td><td>'+money(x.monthly_price_pkr)+'</td><td>'+esc(x.status)+'</td></tr>').join("")));return}
   if(action==="billing"){const invoices=data.filter(x=>x.customer_id===id),invoiceIds=new Set(invoices.map(x=>x.id)),payments=(await call("/api/v1/payments")).data.filter(x=>invoiceIds.has(x.invoice_id));showCustomerPanel("Invoices & payments",'<b>Invoices</b>'+table(["INVOICE","AMOUNT","DUE DATE","STATUS"],invoices.map(x=>'<tr><td>'+esc(x.invoice_number)+'</td><td>'+money(x.amount_pkr)+'</td><td>'+esc(x.due_date||"—")+'</td><td>'+esc(x.status)+'</td></tr>').join(""))+'<b>Payments</b>'+table(["DATE","AMOUNT","METHOD"],payments.map(x=>'<tr><td>'+esc(x.received_at)+'</td><td>'+money(x.amount_pkr)+'</td><td>'+esc(x.method)+'</td></tr>').join("")));return}
   if(action==="tickets"){const list=data.filter(x=>x.customer_id===id);showCustomerPanel("Customer complaints",table(["SUBJECT","PRIORITY","STATUS","CREATED"],list.map(x=>'<tr><td>'+esc(x.subject)+'</td><td>'+esc(x.priority)+'</td><td>'+esc(x.status)+'</td><td>'+esc(x.created_at)+'</td></tr>').join("")));return}
  }catch(err){msg(err.message)}
 });
 }
if(v==="packages"){let d=(await call("/api/v1/packages")).data;page("Packages","Internet speed plans and monthly prices.",'<form id="nxAdd" class="nx-panel nx-row"><input name="name" required placeholder="Plan name"><input name="speedDownMbps" type="number" min="1" required placeholder="Down Mbps"><input name="speedUpMbps" type="number" min="1" required placeholder="Up Mbps"><input name="monthlyPricePkr" type="number" min="0" required placeholder="Monthly PKR"><button class="nx-btn">Add package</button></form>'+table(["NAME","DOWNLOAD","UPLOAD","PRICE","STATUS"],d.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.speed_down_mbps+' Mbps</td><td>'+x.speed_up_mbps+' Mbps</td><td>'+money(x.monthly_price_pkr)+'</td><td>'+esc(x.status)+'</td></tr>').join("")))}
if(v==="subscriptions"){let z=await Promise.all([call("/api/v1/subscriptions"),call("/api/v1/customers"),call("/api/v1/packages")]),d=z[0].data,c=z[1].data,p=z[2].data;page("Subscriptions","Assign internet packages to customers.",'<form id="nxGenerate" class="nx-panel nx-row"><label>Monthly invoice period <input name="period" type="month" required></label><button class="nx-btn">Generate invoices</button></form><form id="nxAdd" class="nx-panel nx-row"><select name="customerId" required><option value="">Customer</option>'+c.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.full_name)+'</option>').join("")+'</select><select name="packageId" required><option value="">Package</option>'+p.filter(x=>x.status==="active").map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("")+'</select><button class="nx-btn">Create subscription</button></form>'+table(["CUSTOMER","PACKAGE","SPEED","PRICE","STATUS"],d.map(x=>'<tr><td>'+esc(x.customer_name)+'</td><td>'+esc(x.package_name)+'</td><td>'+x.speed_down_mbps+'/'+x.speed_up_mbps+'</td><td>'+money(x.monthly_price_pkr)+'</td><td>'+esc(x.status)+'</td></tr>').join("")))}
if(v==="billing"){let z=await Promise.all([call("/api/v1/invoices"),call("/api/v1/customers"),call("/api/v1/payments")]),i=z[0].data,c=z[1].data,p=z[2].data;page("Billing & payments","Invoices and payment ledger.",'<form id="nxAdd" class="nx-panel nx-row"><select name="customerId" required><option value="">Customer</option>'+c.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.full_name)+'</option>').join("")+'</select><input name="amountPkr" type="number" min="0" required placeholder="Amount PKR"><input name="dueDate" type="date"><button class="nx-btn">Create invoice</button></form><form id="nxPay" class="nx-panel nx-row"><select name="invoiceId" required><option value="">Unpaid invoice</option>'+i.filter(x=>x.status!=="paid").map(x=>'<option value="'+esc(x.id)+'">'+esc(x.invoice_number)+' - '+esc(x.customer_name)+'</option>').join("")+'</select><input name="amountPkr" type="number" min="1" required placeholder="Payment PKR"><select name="method"><option>cash</option><option>bank</option><option>jazzcash</option><option>easypaisa</option><option>other</option></select><button class="nx-btn">Record payment</button></form>'+table(["INVOICE","CUSTOMER","AMOUNT","DUE","STATUS"],i.map(x=>'<tr><td>'+esc(x.invoice_number)+'</td><td>'+esc(x.customer_name)+'</td><td>'+money(x.amount_pkr)+'</td><td>'+esc(x.due_date||"—")+'</td><td>'+esc(x.status)+'</td></tr>').join(""))+'<div class="nx-panel"><b>Payments</b>'+p.map(x=>'<p>'+esc(x.customer_name)+' - '+money(x.amount_pkr)+' - '+esc(x.method)+'</p>').join("")+'</div>')}

if(v==="routers"){let d=(await call("/api/v1/routers")).data;page("Routers","Router inventory only. No RouterOS credentials are stored and no commands are sent.",'<form id="nxAdd" class="nx-panel nx-row"><input name="name" required placeholder="Router name"><input name="host" required placeholder="IP / hostname"><input name="apiPort" type="number" min="1" max="65535" value="8728" required><input name="location" placeholder="Location"><input name="notes" placeholder="Notes"><button class="nx-btn">Add router</button></form>'+table(["NAME","HOST","PORT","LOCATION","STATUS","ACTION"],d.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.host)+'</td><td>'+x.api_port+'</td><td>'+esc(x.location||"—")+'</td><td>'+esc(x.status)+'</td><td><button class="nx-btn" data-router-action="toggle" data-id="'+esc(x.id)+'" data-status="'+(x.status==="maintenance"?"configured":"maintenance")+'">'+(x.status==="maintenance"?"Set configured":"Maintenance")+'</button> <button class="nx-btn" data-router-action="delete" data-id="'+esc(x.id)+'">Delete</button></td></tr>').join("")));content.querySelectorAll("[data-router-action]").forEach(b=>b.onclick=async()=>{try{if(b.dataset.routerAction==="delete"){if(!confirm("Delete router record?"))return;await call("/api/v1/routers/"+b.dataset.id,{method:"DELETE"})}else await call("/api/v1/routers/"+b.dataset.id,{method:"PATCH",body:JSON.stringify({status:b.dataset.status})});msg("Router inventory updated");load("routers")}catch(e){msg(e.message)}})}
if(v==="staff"){
 const [staffResult,meResult]=await Promise.all([call("/api/v1/staff"),call("/api/v1/auth/me")]);
 const d=staffResult.data,me=meResult.user;
 const roleChoices=[["billing","Billing"],["noc","Network / NOC"],["support","Customer support"],["technician","Field technician"],["staff","Limited staff"]];
 if(me.role==="owner")roleChoices.push(["admin","Administrator"]);
 const roleOptions=roleChoices.map(item=>'<option value="'+item[0]+'">'+item[1]+'</option>').join("");
 const rows=d.map(x=>{
  const editable=x.role!=="owner"&&(me.role==="owner"||x.role!=="admin");
  if(!editable)return '<tr><td>'+esc(x.full_name)+'</td><td>'+esc(x.email)+'</td><td>'+esc(x.role)+'</td><td>'+esc(x.status)+'</td><td>Protected account</td></tr>';
  const choices=roleChoices.map(item=>'<option value="'+item[0]+'"'+(x.role===item[0]?' selected':'')+'>'+item[1]+'</option>').join("");
  return '<tr><td>'+esc(x.full_name)+'</td><td>'+esc(x.email)+'</td><td><select data-staff-role>'+choices+'</select></td><td><select data-staff-status><option value="active"'+(x.status==="active"?' selected':'')+'>Active</option><option value="inactive"'+(x.status==="inactive"?' selected':'')+'>Inactive</option></select></td><td><button class="nx-btn" type="button" data-staff-save="'+esc(x.id)+'">Save</button> <button class="nx-btn" type="button" data-staff-permissions="'+esc(x.id)+'" data-staff-name="'+esc(x.full_name)+'">Permissions</button></td></tr>';
 }).join("");
 page("Staff & permissions","Create staff accounts, assign roles and customize module access.",'<form id="nxAdd" class="nx-panel nx-row"><input name="fullName" required placeholder="Full name"><input name="email" type="email" required placeholder="Email"><input name="password" type="password" minlength="10" required placeholder="Temporary password"><select name="role">'+roleOptions+'</select><button class="nx-btn">Create staff</button></form>'+table(["NAME","EMAIL","ROLE","STATUS","ACTIONS"],rows));
 content.querySelectorAll("[data-staff-save]").forEach(button=>button.onclick=async()=>{
  const row=button.closest("tr"),id=button.dataset.staffSave;
  try{
   await call("/api/v1/staff/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({role:row.querySelector("[data-staff-role]").value,status:row.querySelector("[data-staff-status]").value})});
   msg("Staff account updated");load("staff");
  }catch(error){msg(error.message)}
 });
 const editPermissions=async(id,name)=>{
  try{
   const state=(await call("/api/v1/staff/"+encodeURIComponent(id)+"/permissions")).data;
   const groups=[...new Set(state.permissions.map(item=>item.group))];
   const permissionCards=groups.map(group=>'<section class="nx-panel"><h3>'+esc(group)+'</h3>'+state.permissions.filter(item=>item.group===group).map(item=>'<label style="display:flex;gap:8px;align-items:center;padding:8px 0;font-size:11px"><input type="checkbox" name="permission" value="'+esc(item.key)+'"'+(item.allowed?' checked':'')+'><span>'+esc(item.label)+(item.overridden?' <small>(custom)</small>':' <small>(role default)</small>')+'</span></label>').join("")+'</section>').join("");
   page("Staff permissions","Account: "+esc(name)+". Select the modules and actions this staff member can use.",'<form id="nxStaffPermissions"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px">'+permissionCards+'</div><div class="nx-panel"><button class="nx-btn" type="submit">Save permissions</button> <button class="nx-btn" id="nxStaffBack" type="button">Back to staff</button></div></form>');
   $("#nxStaffBack").onclick=()=>load("staff");
   $("#nxStaffPermissions").onsubmit=async event=>{
    event.preventDefault();
    const allowedPermissions=[...event.currentTarget.querySelectorAll('input[name="permission"]:checked')].map(input=>input.value);
    try{
     await call("/api/v1/staff/"+encodeURIComponent(id)+"/permissions",{method:"PUT",body:JSON.stringify({allowedPermissions})});
     msg("Permissions saved");load("staff");
    }catch(error){msg(error.message)}
   };
  }catch(error){msg(error.message)}
 };
 content.querySelectorAll("[data-staff-permissions]").forEach(button=>button.onclick=()=>editPermissions(button.dataset.staffPermissions,button.dataset.staffName));
}
if(v==="settings"){
 const [companyResult,settingsResult,profileResult]=await Promise.all([
  call("/api/v1/company"),call("/api/v1/settings"),call("/api/v1/profile")
 ]);
 const company=companyResult||{},prefs=settingsResult||{},profile=profileResult||{};
 page("Settings","Manage company details, workspace preferences and your account profile.",'<div class="nx-settings-grid"><form id="nxCompanyForm" class="nx-panel nx-settings-form"><h3>Company profile</h3><label>Company name<input name="name" required value="'+esc(company.name||"")+'"></label><label>Company email<input name="email" type="email" value="'+esc(company.email||"")+'"></label><label>Phone<input name="phone" value="'+esc(company.phone||"")+'"></label><label>Address<input name="address" value="'+esc(company.address||"")+'"></label><label>Currency<input name="currency" maxlength="3" value="'+esc(company.currency||"PKR")+'"></label><button class="nx-btn" type="submit">Save company profile</button></form><form id="nxProfileForm" class="nx-panel nx-settings-form"><h3>My profile</h3><label>Full name<input name="name" required value="'+esc(profile.name||"")+'"></label><label>Phone<input name="phone" value="'+esc(profile.phone||"")+'"></label><label>Email<input value="'+esc(profile.email||"")+'" disabled></label><label>Role<input value="'+esc(profile.role||"")+'" disabled></label><button class="nx-btn" type="submit">Save profile</button></form></div><form id="nxPreferencesForm" class="nx-panel nx-settings-form"><h3>Workspace preferences</h3><label>Timezone<input name="timezone" value="'+esc(prefs.timezone||"Asia/Karachi")+'"></label><label>Support contact<input name="support_phone" value="'+esc(prefs.support_phone||"")+'"></label><label>Invoice footer<input name="invoice_footer" value="'+esc(prefs.invoice_footer||"")+'"></label><button class="nx-btn" type="submit">Save preferences</button></form>');
 $("#nxCompanyForm").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));try{await call("/api/v1/company",{method:"PUT",body:JSON.stringify(body)});msg("Company profile saved")}catch(error){msg(error.message)}};
 $("#nxProfileForm").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));try{await call("/api/v1/profile",{method:"PUT",body:JSON.stringify(body)});msg("Profile saved")}catch(error){msg(error.message)}};
 $("#nxPreferencesForm").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));try{await call("/api/v1/settings",{method:"PUT",body:JSON.stringify(body)});msg("Workspace preferences saved")}catch(error){msg(error.message)}};
}
if(v==="reports"){let d=(await call("/api/v1/reports/summary")).data;page("Reports","Revenue and outstanding receivables.",'<div class="nx-grid"><div class="nx-kpi"><small>Payments received</small><b>'+money(d.revenuePkr)+'</b></div><div class="nx-kpi"><small>Outstanding</small><b>'+money(d.outstandingPkr)+'</b></div></div>'+table(["MONTH","REVENUE"],d.monthlyRevenue.map(x=>'<tr><td>'+esc(x.month)+'</td><td>'+money(x.revenue)+'</td></tr>').join(""))+table(["INVOICE STATUS","COUNT"],d.invoiceCounts.map(x=>'<tr><td>'+esc(x.status)+'</td><td>'+x.count+'</td></tr>').join("")))}
if(v==="tickets"){let z=await Promise.all([call("/api/v1/tickets"),call("/api/v1/customers")]),d=z[0].data,c=z[1].data;page("Support tickets","Customer complaints and resolution status.",'<form id="nxAdd" class="nx-panel nx-row"><select name="customerId" required><option value="">Customer</option>'+c.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.full_name)+'</option>').join("")+'</select><input name="subject" required placeholder="Complaint subject"><select name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select><input name="description" placeholder="Details"><button class="nx-btn">Create ticket</button></form>'+table(["CUSTOMER","SUBJECT","PRIORITY","STATUS"],d.map(x=>'<tr><td>'+esc(x.customer_name)+'</td><td>'+esc(x.subject)+'</td><td>'+esc(x.priority)+'</td><td>'+esc(x.status)+'</td></tr>').join("")))}
if(v==="audit"){let d=(await call("/api/v1/audit-logs")).data;page("Activity log","Recent workspace actions.",table(["ACTION","TYPE","RECORD","DATE"],d.map(x=>'<tr><td>'+esc(x.action)+'</td><td>'+esc(x.resource_type)+'</td><td>'+esc(x.resource_id)+'</td><td>'+esc(x.created_at)+'</td></tr>').join("")))}
$("#nxAdd")?.addEventListener("submit",async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget)),paths={customers:"/api/v1/customers",packages:"/api/v1/packages",subscriptions:"/api/v1/subscriptions",billing:"/api/v1/invoices",tickets:"/api/v1/tickets",routers:"/api/v1/routers",staff:"/api/v1/staff"};try{await call(paths[view],{method:"POST",body:JSON.stringify(b)});msg("Saved successfully");load(view)}catch(x){msg(x.message)}});
$("#nxGenerate")?.addEventListener("submit",async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget));try{let d=await call("/api/v1/billing/generate",{method:"POST",body:JSON.stringify(b)});msg(d.invoicesCreated+" invoices generated");load("billing")}catch(x){msg(x.message)}});
$("#nxPay")?.addEventListener("submit",async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget));try{await call("/api/v1/payments",{method:"POST",body:JSON.stringify(b)});msg("Payment recorded");load("billing")}catch(x){msg(x.message)}});
}catch(e){page("Could not load",e.message,'<div class="nx-panel" style="color:#b64e3b">'+esc(e.message)+'</div>')}}
document.querySelectorAll(".nav-item").forEach(a=>a.addEventListener("click",e=>{let v=(a.getAttribute("href")||"#").slice(1)||"dashboard";if(v==="support")v="tickets";if(["dashboard","customers","subscriptions","billing","tickets","packages","routers","staff","reports","audit","settings"].includes(v)){e.preventDefault();load(v);$("#sidebar")?.classList.remove("open")}}));
document.querySelectorAll(".nx-module-link").forEach(a=>a.addEventListener("click",e=>{
 e.preventDefault();
 const name=a.dataset.module;
 const descriptions={
  "OLT Devices":"Inventory optical line terminals and PON ports.",
  "ONU / ONT Inventory":"Track customer optical network units and serial numbers.",
  "TR-069 / ACS":"Manage ACS connectivity and remote ONU management.",
  "Connection Status":"Live connection state will appear after network integration is configured."
 };
 page(name,descriptions[name]||"Network management",'<div class="nx-panel"><b>Module setup is not connected yet.</b><p>'+esc(descriptions[name]||"This network module is planned for the Nexus workspace.")+'</p><p class="nx-muted">It will become operational after its database, API, permissions and tests are implemented. No sample records or fake live status are shown.</p></div>');
 $("#sidebar")?.classList.remove("open");
}));
$("#addCustomer")?.addEventListener("click",()=>load("customers"));
$("#menuBtn")?.addEventListener("click",()=>$("#sidebar")?.classList.toggle("open"));
const actions=$(".top-actions");
if(actions&&!$("#nxLogout"))actions.insertAdjacentHTML("beforeend",'<button id="nxLogout" class="nx-btn nx-logout" type="button">Sign out</button>');
$("#nxLogout")?.addEventListener("click",async()=>{
 try{if(token)await call("/api/v1/auth/logout",{method:"POST"})}catch{}
 token="";sessionStorage.removeItem("nexus_token");auth(false);
});
if(token){if(shell)shell.style.display="";load("dashboard")}else auth(false);
})();