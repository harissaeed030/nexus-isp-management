(()=> {
  const $ = (selector) => document.querySelector(selector);
  const money = (value) => "PKR " + Number(value || 0).toLocaleString("en-PK");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const apiBase = (() => {
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    const saved = sessionStorage.getItem("nexus_api");
    if (saved && (local || !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(saved))) return saved;
    if (saved && !local) sessionStorage.removeItem("nexus_api");
    return location.port === "4000" ? location.origin :
      (local ? "http://127.0.0.1:4000" : "https://nexus-saas-api.harissaeed030.workers.dev");
  })();
  let token = sessionStorage.getItem("nexus_customer_token") || "";

  const api = async (path, options = {}) => {
    const response = await fetch(apiBase + "/api/portal" + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const table = (headings, rows) => rows.length
    ? "<table><thead><tr>" + headings.map((heading) => "<th>" + esc(heading) + "</th>").join("") +
      "</tr></thead><tbody>" + rows.join("") + "</tbody></table>"
    : "<p class='muted'>No records yet.</p>";

  function showLogin() {
    token = "";
    sessionStorage.removeItem("nexus_customer_token");
    $("#login").classList.remove("hidden");
    $("#dashboard").classList.add("hidden");
    $("#logout").classList.add("hidden");
  }

  async function load() {
    try {
      const [me, dashboard, invoiceResponse, paymentResponse, ticketResponse] = await Promise.all([
        api("/me"),
        api("/dashboard"),
        api("/invoices"),
        api("/payments"),
        api("/tickets"),
      ]);
      const customer = me.customer || {};
      const invoices = invoiceResponse.data || [];
      const payments = paymentResponse.data || [];
      const tickets = ticketResponse.data || [];
      const activePackage = (dashboard.subscriptions || []).find((item) => item.status === "active");

      $("#login").classList.add("hidden");
      $("#dashboard").classList.remove("hidden");
      $("#logout").classList.remove("hidden");
      $("#customerName").textContent =
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";

      const accountNumber = customer.customer_code || customer.account_number || customer.id || "—";
      const area = [customer.address, customer.city].filter(Boolean).join(", ");
      $("#accountNumber").textContent = "Account " + accountNumber + (area ? " · " + area : "");
      $("#connection").textContent = customer.connection_status || customer.status || "Unknown";

      if (activePackage) {
        const down = activePackage.speed_down || activePackage.speed_mbps || "—";
        const up = activePackage.speed_up || activePackage.speed_mbps || "—";
        const price = activePackage.price ?? 0;
        const expiry = activePackage.end_date || "Not set";
        $("#package").innerHTML =
          "<b>" + esc(activePackage.package_name || "Active package") + "</b>" +
          "<p>" + esc(down) + "/" + esc(up) + " Mbps · " + money(price) + " / " +
          esc(activePackage.billing_cycle || "month") + "</p>" +
          "<small>Expires: " + esc(expiry) + "</small>";
      } else {
        $("#package").innerHTML = "<p>No active package recorded.</p>";
      }

      $("#dues").textContent = money(dashboard.outstanding || 0);
      $("#invoices").innerHTML = table(
        ["INVOICE", "AMOUNT", "PAID", "DUE DATE", "STATUS"],
        invoices.map((invoice) =>
          "<tr><td>" + esc(invoice.invoice_number || invoice.id) + "</td>" +
          "<td>" + money(invoice.total ?? invoice.amount) + "</td>" +
          "<td>" + money(invoice.paid_amount) + "</td>" +
          "<td>" + esc(invoice.due_date || "—") + "</td>" +
          "<td>" + esc(invoice.display_status || invoice.status || "—") + "</td></tr>"
        )
      );
      $("#payments").innerHTML = table(
        ["INVOICE", "AMOUNT", "METHOD", "DATE"],
        payments.map((payment) =>
          "<tr><td>" + esc(payment.invoice_number || payment.invoice_id || "—") + "</td>" +
          "<td>" + money(payment.amount) + "</td>" +
          "<td>" + esc(payment.payment_method || "—") + "</td>" +
          "<td>" + esc(payment.paid_at || "—") + "</td></tr>"
        )
      );
      $("#complaints").innerHTML = tickets.map((ticket) =>
        "<div class='ticket'><b>" + esc(ticket.subject) +
        " <span class='pill'>" + esc(ticket.status) + "</span></b><p>" +
        esc(ticket.description || "") + "</p><small>" +
        esc(ticket.created_at || "") + " · " + esc(ticket.priority || "medium") +
        "</small></div>"
      ).join("") || "<p class='muted'>No complaints submitted.</p>";
    } catch (error) {
      if (/session|sign.?in|authentication/i.test(error.message)) showLogin();
      else alert(error.message);
    }
  }

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#loginError").textContent = "";
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(apiBase + "/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: String(form.identity || "").trim(), password: form.password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Sign in failed");
      token = data.token;
      sessionStorage.setItem("nexus_customer_token", token);
      await load();
    } catch (error) {
      $("#loginError").textContent = error.message;
    }
  });

  $("#complaintForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api("/tickets", { method: "POST", body: JSON.stringify(body) });
      event.currentTarget.reset();
      $("#complaintMessage").textContent = "Complaint submitted successfully.";
      await load();
    } catch (error) {
      $("#complaintMessage").textContent = error.message;
    }
  });

  $("#logout").addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    showLogin();
  });

  if (token) load();
})();
