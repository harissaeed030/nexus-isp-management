(() => {
const $=(s,r=document)=>r.querySelector(s),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let api=sessionStorage.getItem("nexus_api")||(location.port==="4000"?location.origin:"http://127.0.0.1:4000"),token=sessionStorage.getItem("nexus_token")||"",view="dashboard";
const shell=$(".app-shell"),content=$(".content"),toast=$("#toast");
const st=document.createElement("style");st.textContent=".nx-auth{position:fixed;inset:0;z-index:99;background:#f4f8f6;display:grid;place-items:center;padding:18px}.nx-card,.nx-panel,.nx-kpi{background:white;border:1px solid #e5eeea;border-radius:12px;padding:16px;margin:12px 0}.nx-card{width:min(100%,430px);padding:24px}.nx-form,.nx-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.nx-form{display:grid}.nx-form input,.nx-row input,.nx-row select{padding:10px;border:1px solid #dce7e2;border-radius:7px;min-width:120px}.nx-btn{border:0;border-radius:7px;background:#137e62;color:white;padding:10px 14px;font-weight:700}.nx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.nx-kpi small{display:block;color:#82918e}.nx-kpi b{font-size:22px}.nx-table{border-collapse:collapse;width:100%;min-width:520px}.nx-table th,.nx-table td{text-align:left;padding:10px;border-bottom:1px solid #edf2ef;font-size:11px}.nx-table th{color:#82918e;font-size:9px}@media(max-width:650px){.nx-grid{grid-template-columns:repeat(2,1fr)}}.nx-customer-name{border:0;background:transparent;color:#287fb4;font:700 12px Arial;padding:2px 0;cursor:pointer;text-align:left}.nx-customer-name span{color:#87949b;margin-left:5px}.nx-customer-menu{position:relative;z-index:3;background:#fff;border:1px solid #e1e9ed;border-radius:8px;box-shadow:0 8px 24px #20374418;padding:5px;margin-top:7px;min-width:190px}.nx-customer-menu[hidden]{display:none}.nx-customer-menu button{display:block;width:100%;text-align:left;border:0;background:#fff;padding:9px 10px;border-radius:5px;color:#42545d;font-size:11px;cursor:pointer}.nx-customer-menu button:hover{background:#f0f6fa;color:#1684c4}.nx-customer-menu button.danger{color:#c34f4f}.nx-customer-overlay{position:fixed;inset:0;background:#142a3580;z-index:120;display:grid;place-items:center;padding:16px}.nx-customer-dialog{width:min(100%,620px);max-height:85vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 20px 70px #102b3a40}.nx-customer-dialog-head{position:sticky;top:0;background:#fff;padding:15px 18px;border-bottom:1px solid #e8edf0;display:flex;justify-content:space-between;align-items:center}.nx-customer-dialog-head button{border:0;background:#f2f5f7;border-radius:6px;font-size:20px;width:30px;height:30px}.nx-customer-dialog-body{padding:16px}.nx-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.nx-detail-grid div{background:#f6f8fa;border-radius:7px;padding:11px}.nx-detail-grid small,.nx-detail-grid b{display:block}.nx-detail-grid small{font-size:9px;color:#819099;margin-bottom:5px}.nx-detail-grid b{font-size:12px;overflow-wrap:anywhere}";document.head.append(st);
function msg(t){if(toast){toast.textContent=t;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2400)}}
async function call(path,opt={}){let h={"Content-Type":"application/json",...(opt.headers||{})};if(token)h.Authorization="Bearer "+token;let r;try{r=await fetch(api.replace(/\/$/,"")+path,{...opt,headers:h})}catch{throw Error("API connect nahi hua. Backend aur API address check karein.")}let d=await r.json().catch(()=>({error:"Invalid server response"}));if(!r.ok||d.success===false)throw Error(d.error||"Request failed");return d}
function auth(setup=false){let p=$("#nxAuth");if(!p){p=document.createElement("div");p.id="nxAuth";p.className="nx-auth";document.body.append(p)}if(shell)shell.style.display="none";p.innerHTML='<div class="nx-card"><h1>NEXUS</h1><p>ISP Management · Local workspace</p><form id="nxLogin" class="nx-form"><label>API address<input name="api" required value="'+esc(api)+'"></label>'+(setup?'<label>Company<input name="companyName" required value="Vancom Networks"></label><label>Owner name<input name="fullName" required></label>':'')+'<label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required minlength="'+(setup?10:1)+'"></label><button class="nx-btn">'+(setup?"Create owner account":"Sign in")+'</button></form><p id="nxErr" style="color:#b64e3b"></p><button id="nxToggle" class="nx-btn" type="button">'+(setup?"Back to sign in":"First time? Set up Nexus")+'</button><p>Password private rakhein; chat mein share na karein.</p></div>';$("#nxToggle").onclick=()=>auth(!setup);$("#nxLogin").onsubmit=async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget));api=b.api.replace(/\/+$/,"");try{let d=await call(setup?"/api/v1/setup":"/api/v1/auth/login",{method:"POST",body:JSON.stringify(b)});token=d.token;sessionStorage.setItem("nexus_token",token);sessionStorage.setItem("nexus_api",api);p.remove();shell.style.display="";load("dashboard")}catch(x){$("#nxErr").textContent=x.message}}}
const money=n=>"₨ "+Number(n||0).toLocaleString("en-PK");
function table(head,rows){return '<div class="nx-panel" style="overflow:auto"><table class="nx-table"><thead><tr>'+head.map(x=>"<th>"+x+"</th>").join("")+'</tr></thead><tbody>'+(rows||'<tr><td colspan="'+head.length+'">No records found.</td></tr>')+'</tbody></table></div>'}
function showCustomerPanel(title,body){content.querySelector("#nxCustomerPanel")?.remove();content.insertAdjacentHTML("beforeend",'<div class="nx-customer-overlay" id="nxCustomerPanel"><section class="nx-customer-dialog"><div class="nx-customer-dialog-head"><b>'+esc(title)+'</b><button type="button" id="nxCustomerClose">×</button></div><div class="nx-customer-dialog-body">'+body+'</div></section></div>');$("#nxCustomerClose").onclick=()=>$("#nxCustomerPanel").remove();$("#nxCustomerPanel").onclick=e=>{if(e.target.id==="nxCustomerPanel")e.currentTarget.remove()}}
function page(title,sub,body){content.innerHTML='<div class="page-heading"><div><p class="eyebrow">NEXUS WORKSPACE</p><h1>'+title+'</h1><p class="subheading">'+sub+'</p></div><button class="nx-btn" id="nxRefresh">Refresh</button></div>'+body;$("#nxRefresh").onclick=()=>load(view)}
async function load(v){view=v;try{
if(v==="dashboard"){
 const settled=await Promise.allSettled([call("/api/v1/dashboard"),call("/api/v1/reports/summary"),call("/api/v1/subscriptions"),call("/api/v1/invoices"),call("/api/v1/payments"),call("/api/v1/tickets")]);
 if(settled[0].status!=="fulfilled") throw settled[0].reason;
 const stats=settled[0].value.stats;
 const report=settled[1].status==="fulfilled"?settled[1].value.data:{monthlyRevenue:[],outstandingPkr:0};
 const subscriptions=settled[2].status==="fulfilled"?settled[2].value.data:[];
 const invoices=settled[3].status==="fulfilled"?settled[3].value.data:[];
 const payments=settled[4].status==="fulfilled"?settled[4].value.data:[];
 const tickets=settled[5].status==="fulfilled"?settled[5].value.data:[];
 const today=new Date().toISOString().slice(0,10);
 const inactive=Math.max(0,Number(stats.customers||0)-Number(stats.activeCustomers||0));
 const months=Array.isArray(report.monthlyRevenue)?report.monthlyRevenue.slice(0,6).reverse():[];
 const maxRevenue=Math.max(1,...months.map(x=>Number(x.revenue)||0));
 const bars=months.map(x=>'<div class="was-bar-col"><b>'+money(x.revenue)+'</b><i style="height:'+Math.max(3,Math.round((Number(x.revenue)||0)/maxRevenue*100))+'%"></i><small>'+esc(x.month)+'</small></div>').join("");
 const packageCounts={};subscriptions.filter(x=>x.status==="active").forEach(x=>{const name=x.package_name||"Unassigned";packageCounts[name]=(packageCounts[name]||0)+1});
 const packageEntries=Object.entries(packageCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
 const maxPackage=Math.max(1,...packageEntries.map(x=>x[1]));
 const packageBars=packageEntries.map(([name,count])=>'<div class="was-package-row"><span>'+esc(name)+'</span><div><i style="width:'+Math.round(count/maxPackage*100)+'%"></i></div><b>'+count+'</b></div>').join("");
 const dueInvoices=invoices.filter(x=>x.status!=="paid").sort((a,b)=>String(a.due_date||"").localeCompare(String(b.due_date||"")));
 const todayPayments=payments.filter(x=>String(x.received_at||"").slice(0,10)===today);
 const openTickets=tickets.filter(x=>["open","in_progress"].includes(x.status));
 const promiseRows=dueInvoices.slice(0,8).map(x=>'<tr><td>'+esc(x.customer_name||"—")+'</td><td>'+esc(x.invoice_number||"—")+'</td><td>'+esc(x.due_date||"—")+'</td><td>'+money(x.amount_pkr)+'</td><td>'+esc(x.status)+'</td></tr>').join("");
 const collectionRows=todayPayments.slice(0,8).map(x=>'<tr><td>'+esc(x.customer_name||"—")+'</td><td>'+money(x.amount_pkr)+'</td><td>'+esc(x.method||"—")+'</td><td>'+esc(x.received_at||"—")+'</td></tr>').join("");
 const complaintRows=openTickets.slice(0,8).map(x=>'<tr><td>'+esc(x.customer_name||"—")+'</td><td>'+esc(x.subject||"—")+'</td><td>'+esc(x.priority||"normal")+'</td><td>'+esc(x.status||"open")+'</td></tr>').join("");
 const promiseBody=settled[3].status==="fulfilled"?table(["CUSTOMER","INVOICE","DUE DATE","AMOUNT","STATUS"],promiseRows):'<div class="was-empty">Invoice list is not available for this account role.</div>';
 const collectionBody=settled[4].status==="fulfilled"?table(["CUSTOMER","AMOUNT","METHOD","RECEIVED"],collectionRows):'<div class="was-empty">Payment list is not available for this account role.</div>';
 const complaintBody=settled[5].status==="fulfilled"?table(["CUSTOMER","COMPLAINT","PRIORITY","STATUS"],complaintRows):'<div class="was-empty">Complaint list is not available for this account role.</div>';
 page("Dashboard","ISP operations overview · Live data from your Nexus workspace.",'<div class="was-topcards"><article><small>Total Users</small><b>'+stats.customers+'</b><span>Registered customers</span></article><article><small>Active Connections</small><b>'+stats.activeCustomers+'</b><span>Active customer accounts</span></article><article><small>Not Active</small><b>'+inactive+'</b><span>Inactive / other status</span></article><article><small>Receivables</small><b>'+money(report.outstandingPkr)+'</b><span>Outstanding invoices</span></article><article><small>Total Received</small><b>'+money(stats.revenuePkr)+'</b><span>Recorded payments</span></article></div><section class="was-panel was-collections"><div class="was-tabs" role="tablist"><button type="button" class="selected" data-dash-tab="promise">▣ Promise Date / Due</button><button type="button" data-dash-tab="collection">▣ Today’s Collection</button><button type="button" data-dash-tab="operators">♟ Operators Collection</button><button type="button" data-dash-tab="complaints">⚠ Complaints</button></div><div class="was-toolbar"><b id="wasTabTitle">Due payments & follow-up</b><span>'+new Date().toLocaleDateString("en-GB")+'</span></div><div id="wasTabBody">'+promiseBody+'</div></section><div class="was-dashboard-grid"><section class="was-panel"><h3>Connection Summary</h3><p>Subscriber connection status overview</p><div class="was-donut" style="--active:'+(stats.customers?Math.round(stats.activeCustomers/stats.customers*100):0)+'%"></div><div class="was-legend"><span>● Active '+stats.activeCustomers+'</span><span>● Not active '+inactive+'</span></div></section><section class="was-panel"><h3>Exciting Features of <b>Nexus</b></h3><div class="was-feature-list">'+[["Customer details and subscriber management"],["New Queries","Track new connection requests"],["Area Allocation","Organize service areas and field teams"],["Generate monthly customer invoices"],["Users Collections","Record and reconcile payments"],["TR-069 / ACS","ONU remote management integration"]].map(x=>'<div class="was-feature"><i>✦</i><span><b>'+x[0]+'</b><small>'+x[1]+'</small></span></div>').join("")+'</div></section></div><section class="was-panel was-monthly"><h3>Last 6 Months Receiving</h3><p>Recorded customer payments · PKR</p><div class="was-bars">'+(bars||'<div class="was-empty">No monthly payment records available yet.</div>')+'</div></section><section class="was-panel"><h3>Users Package Wise</h3><p>Active subscriber distribution by internet package</p><div class="was-package-chart">'+(packageBars||'<div class="was-empty">No active package subscriptions found yet.</div>')+'</div></section>');
 const tabButtons=content.querySelectorAll("[data-dash-tab]");
 tabButtons.forEach(button=>button.addEventListener("click",()=>{
  tabButtons.forEach(b=>b.classList.toggle("selected",b===button));
  const key=button.dataset.dashTab,body=$("#wasTabBody"),title=$("#wasTabTitle");
  if(key==="promise"){title.textContent="Due payments & follow-up";body.innerHTML=promiseBody}
  else if(key==="collection"){title.textContent="Payments received today";body.innerHTML=collectionBody}
  else if(key==="complaints"){title.textContent="Open customer complaints";body.innerHTML=complaintBody}
  else{title.textContent="Operator collections";body.innerHTML='<div class="was-empty">Operator-wise collection tracking will appear when staff collection allocation is added. No sample figures are shown.</div>'}
 }));
}
if(v==="customers"){
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
if(v==="staff"){let d=(await call("/api/v1/staff")).data;page("Staff & permissions","Create staff accounts for your workspace.",'<form id="nxAdd" class="nx-panel nx-row"><input name="fullName" required placeholder="Full name"><input name="email" type="email" required placeholder="Email"><input name="password" type="password" minlength="10" required placeholder="Temporary password"><select name="role"><option value="billing">Billing</option><option value="noc">Network / NOC</option><option value="support">Customer support</option><option value="admin">Administrator (owner only)</option></select><button class="nx-btn">Create staff</button></form>'+table(["NAME","EMAIL","ROLE","STATUS"],d.map(x=>'<tr><td>'+esc(x.full_name)+'</td><td>'+esc(x.email)+'</td><td>'+esc(x.role)+'</td><td>'+esc(x.status)+'</td></tr>').join("")))}
if(v==="reports"){let d=(await call("/api/v1/reports/summary")).data;page("Reports","Revenue and outstanding receivables.",'<div class="nx-grid"><div class="nx-kpi"><small>Payments received</small><b>'+money(d.revenuePkr)+'</b></div><div class="nx-kpi"><small>Outstanding</small><b>'+money(d.outstandingPkr)+'</b></div></div>'+table(["MONTH","REVENUE"],d.monthlyRevenue.map(x=>'<tr><td>'+esc(x.month)+'</td><td>'+money(x.revenue)+'</td></tr>').join(""))+table(["INVOICE STATUS","COUNT"],d.invoiceCounts.map(x=>'<tr><td>'+esc(x.status)+'</td><td>'+x.count+'</td></tr>').join("")))}
if(v==="tickets"){let z=await Promise.all([call("/api/v1/tickets"),call("/api/v1/customers")]),d=z[0].data,c=z[1].data;page("Support tickets","Customer complaints and resolution status.",'<form id="nxAdd" class="nx-panel nx-row"><select name="customerId" required><option value="">Customer</option>'+c.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.full_name)+'</option>').join("")+'</select><input name="subject" required placeholder="Complaint subject"><select name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select><input name="description" placeholder="Details"><button class="nx-btn">Create ticket</button></form>'+table(["CUSTOMER","SUBJECT","PRIORITY","STATUS"],d.map(x=>'<tr><td>'+esc(x.customer_name)+'</td><td>'+esc(x.subject)+'</td><td>'+esc(x.priority)+'</td><td>'+esc(x.status)+'</td></tr>').join("")))}
if(v==="audit"){let d=(await call("/api/v1/audit-logs")).data;page("Activity log","Recent workspace actions.",table(["ACTION","TYPE","RECORD","DATE"],d.map(x=>'<tr><td>'+esc(x.action)+'</td><td>'+esc(x.resource_type)+'</td><td>'+esc(x.resource_id)+'</td><td>'+esc(x.created_at)+'</td></tr>').join("")))}
$("#nxAdd")?.addEventListener("submit",async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget)),paths={customers:"/api/v1/customers",packages:"/api/v1/packages",subscriptions:"/api/v1/subscriptions",billing:"/api/v1/invoices",tickets:"/api/v1/tickets",routers:"/api/v1/routers",staff:"/api/v1/staff"};try{await call(paths[view],{method:"POST",body:JSON.stringify(b)});msg("Saved successfully");load(view)}catch(x){msg(x.message)}});
$("#nxGenerate")?.addEventListener("submit",async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget));try{let d=await call("/api/v1/billing/generate",{method:"POST",body:JSON.stringify(b)});msg(d.invoicesCreated+" invoices generated");load("billing")}catch(x){msg(x.message)}});
$("#nxPay")?.addEventListener("submit",async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(e.currentTarget));try{await call("/api/v1/payments",{method:"POST",body:JSON.stringify(b)});msg("Payment recorded");load("billing")}catch(x){msg(x.message)}});
}catch(e){page("Could not load",e.message,'<div class="nx-panel" style="color:#b64e3b">'+esc(e.message)+'</div>')}}
document.querySelectorAll(".nav-item").forEach(a=>a.addEventListener("click",e=>{let v=(a.getAttribute("href")||"#").slice(1)||"dashboard";if(v==="support")v="tickets";if(["dashboard","customers","subscriptions","billing","tickets","packages","routers","staff","reports","audit"].includes(v)){e.preventDefault();load(v);closeMobileSidebar()}}));
$("#addCustomer")?.addEventListener("click",()=>load("customers"));$("#dismissNotice")?.addEventListener("click",()=>$(".notice")?.remove());const menuButton=$("#menuBtn"),sidebar=$("#sidebar");
function closeMobileSidebar(){sidebar?.classList.remove("open");document.querySelector(".sidebar-backdrop")?.remove()}
menuButton?.addEventListener("click",()=>{
 if(window.matchMedia("(max-width:760px)").matches){
  sidebar?.classList.toggle("open");
  if(sidebar?.classList.contains("open")){
   if(!document.querySelector(".sidebar-backdrop")){const shade=document.createElement("button");shade.type="button";shade.className="sidebar-backdrop";shade.setAttribute("aria-label","Close navigation");shade.onclick=closeMobileSidebar;document.body.append(shade)}
  }else closeMobileSidebar();
 }else shell?.classList.toggle("sidebar-collapsed");
});
const actions=$(".top-actions");if(actions)actions.insertAdjacentHTML("beforeend",'<button id="nxLogout" class="nx-btn" type="button" style="padding:7px 10px">Sign out</button>');$("#nxLogout")?.addEventListener("click",async()=>{try{if(token)await call("/api/v1/auth/logout",{method:"POST"})}catch{}token="";sessionStorage.removeItem("nexus_token");auth(false)});

const moduleGroups=[
["CUSTOMER MANAGEMENT",["Area / Coverage","Country, City & Locality","New Queries","Box / Media Inventory","Connection Providers","Radius Users"]],
["FIELD OPERATIONS",["Dealers Profile","Recovery Officers","Area Allocation","Promise Dates","Operator Collections"]],
["COMMERCIAL",["Dealer Collections","Allocated Collections","Recharge System","Internet Recharge","Recharge Packages"]],
["COMMUNICATION",["New Messages","Expiry Messages","WhatsApp Draft Messages","Sent Messages"]],
["FINANCE & REPORTS",["Account Heads","Account Entries","One Day Accounts","Defaulter Reports","Package Wise Report","Monthly Collection Report","Unpaid Collection","Transaction Wise Report"]],
["ADMINISTRATION",["Company Profile","User Rights","Configurations","Change Username / Password","Deleted Users"]],
["FIBER NETWORK",["OLT Devices","ONU / ONT Inventory","TR-069 / ACS","Connection Status"]]
];
const moduleSlug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const moduleIcons={"Area / Coverage":"⌖","Country, City & Locality":"⌂","User Profiles":"♙","New Queries":"✉","Box / Media Inventory":"▣","Connection Providers":"⇄","Radius Users":"◎","Dealers Profile":"♧","Recovery Officers":"♙","Area Allocation":"⌖","Promise Dates":"◷","Operator Collections":"▤","Transactions":"⇄","Bills Creator":"▤","User Collections":"▤","Dealer Collections":"♧","Allocated Collections":"▥","Recharge System":"↻","Internet Recharge":"⌁","Recharge Packages":"◈","New Messages":"✉","Expiry Messages":"◷","WhatsApp Draft Messages":"✎","Sent Messages":"➤","Account Heads":"▤","Account Entries":"≡","One Day Accounts":"▦","Users Reports":"▥","Defaulter Reports":"⚑","Package Wise Report":"◈","Monthly Collection Report":"▥","Unpaid Collection":"◷","Transaction Wise Report":"⇄","Company Profile":"▣","User Rights":"♙","Configurations":"⚙","Change Username / Password":"⚿","Deleted Users":"▱","Activity Log":"≡"};
const moduleNav=moduleGroups.filter(([group])=>group!=="FIBER NETWORK").map(([group,items])=>'<section class="nav-section"><div class="nav-section-heading"><span>'+group+'</span><i>'+items.length+'</i></div><nav class="nav nav-sub" aria-label="'+group+'">'+items.map(item=>'<a class="nav-item nx-module-link" href="#module-'+moduleSlug(item)+'" data-module="'+esc(item)+'"><span class="nav-icon">'+(moduleIcons[item]||"◇")+'</span><span class="nav-text">'+esc(item)+'</span></a>').join("")+'</nav></section>').join("");
sidebar?.querySelector(".sidebar-bottom")?.insertAdjacentHTML("beforebegin",'<div class="nav-extra">'+moduleNav+'</div>');
sidebar?.querySelectorAll(".nx-module-link").forEach(a=>a.addEventListener("click",e=>{
 e.preventDefault();const name=a.dataset.module;
 document.querySelectorAll(".nav-item").forEach(item=>item.classList.toggle("active",item===a));
 closeMobileSidebar();
 const descriptions={
 "Area / Coverage":"Define service zones, neighborhoods and coverage boundaries.",
 "Country, City & Locality":"Organize customer locations and service areas.",
 "User Profiles":"Manage subscriber records, contact details and service status.",
 "New Queries":"Capture new service requests and installation leads.",
 "Box / Media Inventory":"Track splitters, distribution boxes and fiber materials.",
 "Connection Providers":"Record upstream and connectivity providers.",
 "Radius Users":"Prepare subscriber identity and PPP/RADIUS integration records.",
 "Dealers Profile":"Manage dealer accounts, assigned areas and collections.",
 "Recovery Officers":"Assign collection staff and recovery territories.",
 "Area Allocation":"Allocate customers and collection responsibilities by area.",
 "Promise Dates":"Track customer payment commitments and follow-up dates.",
 "Operator Collections":"Record collections received by field operators.",
 "Transactions":"Review financial transactions and payment records.",
 "Bills Creator":"Create customer invoices and monthly billing runs.",
 "User Collections":"Record and reconcile subscriber payments.",
 "Dealer Collections":"Track dealer deposits and settlements.",
 "Allocated Collections":"Review collections allocated to staff or dealers.",
 "Recharge System":"Manage prepaid recharge workflows and package top-ups.",
 "Internet Recharge":"Record internet package recharge activity.",
 "Recharge Packages":"Configure prepaid recharge products.",
 "New Messages":"Prepare customer notices and service announcements.",
 "Expiry Messages":"Prepare package expiry and due-payment reminders.",
 "WhatsApp Draft Messages":"Create WhatsApp-ready customer message drafts.",
 "Sent Messages":"Review communication history.",
 "Account Heads":"Configure income, expense and ledger categories.",
 "Account Entries":"Record business income and expense entries.",
 "One Day Accounts":"Review daily cash and account balances.",
 "Users Reports":"Build subscriber activity and status reports.",
 "Defaulter Reports":"Identify overdue invoices and unpaid subscribers.",
 "Package Wise Report":"Analyze subscribers by internet package.",
 "Monthly Collection Report":"Review monthly collection performance.",
 "Unpaid Collection":"Track outstanding customer balances.",
 "Transaction Wise Report":"Review payment transactions by date and method.",
 "Company Profile":"Manage ISP company identity and contact information.",
 "User Rights":"Control staff roles and module permissions.",
 "Configurations":"Manage workspace settings and operational defaults.",
 "Change Username / Password":"Update account credentials securely.",
 "Deleted Users":"Review removed or deactivated subscriber records.",
 "Activity Logs":"Review workspace actions and audit history.",
 "OLT Devices":"Inventory optical line terminals and PON ports.",
 "ONU / ONT Inventory":"Track customer optical network units and serial numbers.",
 "TR-069 / ACS":"Plan ACS connectivity and remote ONU management.",
 "Connection Status":"View live service state after network integrations are configured."
 };
 page(name,descriptions[name]||"Nexus module",'<div class="nx-panel"><b>Module setup is not connected yet.</b><p>'+esc(descriptions[name]||"This module is planned for the Nexus workspace.")+'</p><p style="color:#82918e">This section is listed for the complete ISP workflow. It will become operational after its database, API, permissions and tests are implemented. No sample records or fake live status are shown.</p></div>');
}));

if(token){if(shell)shell.style.display="";load("dashboard")}else auth(false);

/* Navigation polish: compact groups, reliable mobile drawer and active states. */
sidebar?.querySelectorAll(".nav-section").forEach((section,index)=>{
 const heading=section.querySelector(".nav-section-heading");
 const nav=section.querySelector(".nav-sub");
 if(!heading||!nav)return;
 const label=heading.querySelector("span")?.textContent?.trim()||"Navigation group";
 const count=heading.querySelector("i")?.textContent?.trim()||"";
 const id="nx-nav-group-"+index;
 nav.id=id;
 heading.innerHTML='<button class="nav-group-toggle" type="button" aria-expanded="false" aria-controls="'+id+'"><span>'+esc(label)+'</span><small>'+esc(count)+'</small><b aria-hidden="true">⌄</b></button>';
 heading.querySelector("button")?.addEventListener("click",()=>{
  const button=heading.querySelector("button");
  const expanded=button.getAttribute("aria-expanded")==="true";
  button.setAttribute("aria-expanded",String(!expanded));
  section.classList.toggle("is-expanded",!expanded);
  nav.hidden=expanded;
 });
 nav.hidden=true;
});
function syncMenuState(open){
 const mobile=window.matchMedia("(max-width:760px)").matches;
 if(!sidebar)return;
 if(mobile){
  sidebar.classList.toggle("open",open);
  document.body.classList.toggle("nx-menu-open",open);
  menuButton?.setAttribute("aria-expanded",String(open));
  if(open&&!document.querySelector(".sidebar-backdrop")){
   const shade=document.createElement("button");
   shade.type="button";shade.className="sidebar-backdrop";
   shade.setAttribute("aria-label","Close navigation menu");
   shade.addEventListener("click",()=>syncMenuState(false));
   document.body.append(shade);
  }else if(!open)document.querySelector(".sidebar-backdrop")?.remove();
 }else{
  sidebar.classList.remove("open");
  document.body.classList.remove("nx-menu-open");
  document.querySelector(".sidebar-backdrop")?.remove();
  menuButton?.setAttribute("aria-expanded","false");
 }
}
menuButton?.setAttribute("aria-controls","sidebar");
menuButton?.setAttribute("aria-expanded","false");
menuButton?.addEventListener("click",()=>{
 if(window.matchMedia("(max-width:760px)").matches)syncMenuState(!sidebar?.classList.contains("open"));
 else shell?.classList.toggle("sidebar-collapsed");
});
document.addEventListener("keydown",event=>{
 if(event.key==="Escape"&&sidebar?.classList.contains("open"))syncMenuState(false);
});
sidebar?.addEventListener("click",event=>{
 const link=event.target.closest("a.nav-item");
 if(!link)return;
 sidebar.querySelectorAll("a.nav-item").forEach(item=>item.classList.toggle("active",item===link));
 if(window.matchMedia("(max-width:760px)").matches)syncMenuState(false);
});
window.addEventListener("resize",()=>{
 if(!window.matchMedia("(max-width:760px)").matches)syncMenuState(false);
});

})();