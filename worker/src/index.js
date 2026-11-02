const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
  const headers = new Headers();
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET") {
      const response = json({ error: "Method not allowed" }, 405);
      cors.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    if (url.pathname === "/api/health") {
      let database = "not_configured";
      if (env.DB) {
        try {
          await env.DB.prepare("SELECT 1 AS ok").first();
          database = "connected";
        } catch {
          database = "error";
        }
      }

      const response = json({
        service: "Nexus API",
        status: "ok",
        database,
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      });
      cors.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const response = json({ error: "Route not found" }, 404);
    cors.forEach((value, key) => response.headers.set(key, value));
    return response;
  }
};
