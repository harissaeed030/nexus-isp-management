export async function onRequest({ request, env }) {
  const apiBase = env.API_URL || env.VITE_API_URL;
  if (!apiBase) {
    return Response.json({ error: "Pages API_URL is not configured" }, { status: 503 });
  }

  let upstream;
  try {
    const base = new URL(apiBase);
    if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) {
      return Response.json({ error: "Pages API_URL must be an HTTPS origin" }, { status: 503 });
    }
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    upstream = new URL(incoming.pathname + incoming.search, base);
  } catch {
    return Response.json({ error: "Pages API_URL is invalid" }, { status: 503 });
  }

  // Keep the incoming method, headers, body, query string, and auth token intact.
  // Preview and production select different upstreams through Pages environment bindings.
  return fetch(new Request(upstream, request));
}
