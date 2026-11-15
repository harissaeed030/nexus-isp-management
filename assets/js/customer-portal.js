(() => {
"use strict";
const root=document.getElementById("portalApp");
const params=new URLSearchParams(location.search);
const local=["localhost","127.0.0.1"].includes(location.hostname);
let api=sessionStorage.getItem("nexus_portal_api")||sessionStorage.getItem("nexus_api")||(location.port==="4000"?location.origin:(local?"http://127.0.0.1:4000":"https://nexus-saas-api.harissaeed030.workers.dev"));
let token=sessionStorage.getItem("nexus_portal_token")||"";
let currency="PKR";
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const money=value=>{try{return new Intl.NumberFormat("en-PK",{style:"currency",currency,maximumFractionDigits:0}).format(Number(value||0))}catch{return "₨ "+Number(value||0).toLocaleString("en-PK")}};
const date=value=>value?esc(String(value).slice(0,10)):"—";
const fullName=c=>[c?.first_name,c?.last_name].filter(Boolean).join(" ")||"Customer";
function clearSession(){token="";sessionStorage.removeItem("nexus_portal_token")}
async function request(path,options={}){
 const headers={"Content-Type":"application/json",...(options.headers||{})};
 if(token)headers.Authorization="Bearer "+token;
 let response;
 try{response=await fetch(api.replace(/\/$/,"")+path,{method:options.method||"GET",headers,body:options.body===undefined?undefined:JSON.stringify(options.body)})}
 catch{throw new Error("NEXUS API se connection nahi ho saka. Internet aur API address check karein.")}
 const data=await response.json().catch(()=>({error:"Invalid server response"}));
 if(!response.ok){if(response.status===401&&token)clearSession();throw new Error(data.error||("Request failed ("+response.status+")"))}
 return data;
}
function loginScreen(message=""){
 const workspace=params.get("workspace")||"";
 root.innerHTML='<div class="login-wrap"><section class="login-card"><div class="brand"><span class="brand-mark">N</span><span><strong>NEXUS</strong><small>CUSTOMER SELF-SERVICE</small></span></div><h1>Customer sign in</h1><p class="muted">View your internet package, invoices, payments and support requests.</p><form id="portalLogin" class="form-grid"><label>ISP workspace slug<input name="workspace" required autocomplete="organization" value="'+esc(workspace)+'" placeholder="Your ISP workspace"></label><label>Email address<input name="email" type="email" required autocomplete="username" placeholder="Customer email"></label><label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="Portal password"></label><label>API address (advanced)<input name="api" type="url" required value="'+esc(api)+'"></label><button class="btn">Sign in securely</button></form><p class="error" id="loginError">'+esc(message)+'</p><p class="muted" style="font-size:11px">Ask your ISP office for your workspace slug and portal login credentials.</p></section></div>';
 root.querySelector("#portalLogin").onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form));api=String(values.api||"").replace(/\/+$/,"");sessionStorage.setItem("nexus_portal_api",api);const button=form.querySelector("button");button.disabled=true;button.textContent="Signing in…";
  try{const result=await request("/api/portal/auth/login",{method:"POST",body:{workspace:values.workspace,email:values.email,password:values.password}});token=result.token;sessionStorage.setItem("nexus_portal_token",token);await loadPortal()}
  catch(error){root.querySelector("#loginError").textContent=error.message;button.disabled=false;button.textContent="Sign in securely"}
 };
}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(x=>"<th>"+esc(x)+"</th>").join("")+'</tr></thead><tbody>'+(rows||'<tr><td colspan="'+headers.length+'" class="empty">No records found.</td></tr>')+'</tbody></table></div>'}
function status(value){const text=String(value||"unknown");return '<span class="status '+esc(text.toLowerCase())+'">'+esc(text.replace(/_/g," "))+'</span>'}
function render(data){
 const {profile,dashboard,invoices,payments,tickets,subscriptions}=data;
 currency=profile.tenant?.currency||"PKR";
 const c=profile.customer||{},tenant=profile.tenant||{},settings=profile.settings||{};
 const active=(subscriptions||[]).filter(x=>x.status==="active");
 const invoiceRows=(invoices||[]).map(x=>'<tr><td><b>'+esc(x.invoice_number)+'</b><br><small>'+date(x.issue_date)+'</small></td><td>'+money(x.total)+'</td><td>'+money(x.paid_amount)+'</td><td>'+money(x.outstanding_amount)+'</td><td>'+status(x.display_status||x.status)+'</td><td><button class="btn secondary" data-print-invoice="'+esc(x.id)+'" type="button">Print</button></td></tr>').join("");
 const subscriptionRows=(subscriptions||[]).map(x=>'<tr><td><b>'+esc(x.package_name)+'</b><br><small>'+esc(x.billing_cycle||"monthly")+'</small></td><td>'+esc(x.speed_down||x.speed_mbps||"—")+' / '+esc(x.speed_up||x.speed_mbps||"—")+' Mbps</td><td>'+money(x.price)+'</td><td>'+status(x.status)+'</td><td>'+date(x.end_date)+'</td></tr>').join("");
 const paymentRows=(payments||[]).map(x=>'<tr><td>'+date(x.paid_at)+'</td><td>'+esc(x.invoice_number||"—")+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.payment_method||"—")+'</td><td>'+status(x.status)+'</td></tr>').join("");
 const ticketRows=(tickets||[]).map(x=>'<tr><td><b>'+esc(x.subject)+'</b><br><small>'+date(x.created_at)+'</small></td><td>'+esc(x.priority)+'</td><td>'+status(x.status)+'</td><td>'+esc(x.resolution||"—")+'</td></tr>').join("");
 root.innerHTML='<div class="portal-shell"><header class="portal-header"><div class="brand"><span class="brand-mark">N</span><span><strong>NEXUS</strong><small>CUSTOMER PORTAL · '+esc(tenant.name||"ISP")+'</small></span></div><div class="header-actions"><span>'+esc(fullName(c))+'</span><button class="btn light" id="portalLogout" type="button">Sign out</button></div></header><section class="welcome"><h1>Welcome, '+esc(c.first_name||"Customer")+'</h1><p class="muted">'+esc(c.customer_code||"")+' · Your internet account overview</p></section><section class="grid"><article class="kpi"><small>Outstanding dues</small><strong>'+money(dashboard.outstanding)+'</strong></article><article class="kpi"><small>Active packages</small><strong>'+active.length+'</strong></article><article class="kpi"><small>Open complaints</small><strong>'+Number(dashboard.openTickets||0)+'</strong></article></section><section class="layout"><article class="panel"><h2>My profile</h2><div class="profile-grid">'+[["Customer",fullName(c)],["Customer code",c.customer_code],["Email",c.email],["Phone",c.phone],["Address",c.address],["City",c.city],["Account status",c.status],["ISP",tenant.name]].map(([k,v])=>'<div class="profile-item"><small>'+esc(k)+'</small><b>'+esc(v||"—")+'</b></div>').join("")+'</div></article><article class="panel"><h2>Payment information</h2><div class="notice">'+(settings.payment_instructions?esc(settings.payment_instructions).replace(/\n/g,"<br>"):"Online payment is not enabled in this portal. Please contact your ISP office for approved payment methods and instructions.")+'</div><p class="muted" style="font-size:12px">Support: '+esc(settings.support_phone||tenant.phone||"—")+' · '+esc(settings.support_email||tenant.email||"")+'</p></article></section><section class="panel section"><h2>My internet packages</h2>'+table(["PACKAGE","SPEED DOWN / UP","MONTHLY PRICE","STATUS","END DATE"],subscriptionRows)+'</section><section class="panel section"><h2>My invoices</h2>'+table(["INVOICE","TOTAL","PAID","DUE","STATUS","COPY"],invoiceRows)+'</section><section class="panel section"><h2>Payment history</h2>'+table(["DATE","INVOICE","AMOUNT","METHOD","STATUS"],paymentRows)+'</section><section class="layout"><article class="panel"><h2>Submit a complaint</h2><form id="portalTicket" class="form-grid"><label>Subject<input name="subject" required maxlength="180" placeholder="Describe the issue"></label><label>Details<textarea name="description" maxlength="4000" placeholder="Tell us what happened"></textarea></label><button class="btn">Submit complaint</button></form><p class="muted" style="font-size:11px">Your complaint will be sent to the ISP support team.</p></article><article class="panel"><h2>My complaints</h2>'+table(["COMPLAINT","PRIORITY","STATUS","RESOLUTION"],ticketRows)+'</article></section><section class="panel section"><h2>Change portal password</h2><form id="portalPassword" class="inline-form"><input name="currentPassword" type="password" required autocomplete="current-password" placeholder="Current password"><input name="newPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="New password (8+ characters)"><button class="btn">Update password</button></form></section><footer class="footer">NEXUS ISP Management · Customer self-service</footer></div>';
 root.querySelector("#portalLogout").onclick=async()=>{try{await request("/api/portal/auth/logout",{method:"POST",body:{}})}catch{}clearSession();loginScreen()};
 root.querySelector("#portalTicket").onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector("button");button.disabled=true;try{await request("/api/portal/tickets",{method:"POST",body:Object.fromEntries(new FormData(form))});await loadPortal();root.querySelector("#portalTicket")?.insertAdjacentHTML("beforeend",'<p class="notice">Complaint submitted successfully.</p>')}catch(error){alert(error.message)}finally{button.disabled=false}};
 root.querySelector("#portalPassword").onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form));try{await request("/api/portal/password",{method:"PUT",body:values});clearSession();loginScreen("Password changed. Please sign in with your new password.")}catch(error){alert(error.message)}};
 root.querySelectorAll("[data-print-invoice]").forEach(button=>button.onclick=()=>printInvoice(button.dataset.printInvoice));
}
async function printInvoice(id){
 const win=window.open("","_blank","width=850,height=900");if(!win){alert("Please allow pop-ups to print the invoice.");return}
 try{
 const invoice=await request("/api/portal/invoices/"+encodeURIComponent(id));
 const me=await request("/api/portal/me"),c=me.customer||{},tenant=me.tenant||{};
 const rows=(invoice.payments||[]).map(p=>'<tr><td>'+date(p.paid_at)+'</td><td>'+esc(p.payment_method||"—")+'</td><td>'+esc(p.transaction_ref||"—")+'</td><td>'+money(p.amount)+'</td></tr>').join("");
 const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(invoice.invoice_number)+'</title><style>body{font:14px Arial;color:#18352d;margin:32px}header{display:flex;justify-content:space-between;border-bottom:2px solid #167c5c;padding-bottom:18px}.muted{color:#64786e}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}.total{text-align:right;font-size:18px;margin-top:24px}@media print{button{display:none}}</style></head><body><header><div><h2>'+esc(tenant.name||"Internet Service Provider")+'</h2><div>'+esc(tenant.address||"")+'</div><div>'+esc(tenant.phone||"")+'</div></div><div style="text-align:right"><h2>INVOICE</h2><b>'+esc(invoice.invoice_number)+'</b><p>Issued: '+date(invoice.issue_date)+'<br>Due: '+date(invoice.due_date)+'</p></div></header><h3>Bill to: '+esc(fullName(c))+'</h3><p class="muted">'+esc(c.email||"")+' · '+esc(c.phone||"")+'</p><table><tbody><tr><td>Internet service</td><td>'+money(invoice.amount)+'</td></tr><tr><td>Tax</td><td>'+money(invoice.tax)+'</td></tr></tbody></table><div class="total">Total: <b>'+money(invoice.total)+'</b><p>Paid: '+money(invoice.paid_amount)+'<br>Outstanding: '+money(invoice.outstanding_amount)+'</p></div><h3>Payment history</h3><table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>'+rows+'</tbody></table><p class="muted">Please use the payment instructions provided by your ISP.</p><script>window.onload=()=>window.print()<\/script></body></html>';
 win.document.write(html);win.document.close();
 }catch(error){win.close();alert(error.message)}
}
async function loadPortal(){
 const [profile,dashboard,invoiceResult,paymentResult,ticketResult,subscriptionResult]=await Promise.all([
  request("/api/portal/me"),request("/api/portal/dashboard"),request("/api/portal/invoices?per_page=100"),request("/api/portal/payments?per_page=100"),request("/api/portal/tickets?per_page=100"),request("/api/portal/subscriptions")
 ]);
 render({profile,dashboard,invoices:invoiceResult.data||[],payments:paymentResult.data||[],tickets:ticketResult.data||[],subscriptions:subscriptionResult.data||[]});
}
if(token){loadPortal().catch(error=>loginScreen(error.message))}else loginScreen();
})();