const ALLOWED_ITERATIONS = [100000, 200000, 300000, 600000];
const encoder = new TextEncoder();

async function derive(iterations) {
  // Fixed synthetic value only. Never send a real user's password to this benchmark.
  const password = encoder.encode("NEXUS-local-password-hash-benchmark-only");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ ok: true, mode: "local-benchmark-only" });
    }
    if (url.pathname !== "/bench" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    let body;
    try { body = await request.json(); } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const samples = Number(body?.samples ?? 5);
    const warmups = Number(body?.warmups ?? 1);
    if (!Number.isInteger(samples) || samples < 3 || samples > 10 ||
        !Number.isInteger(warmups) || warmups < 1 || warmups > 3) {
      return Response.json({ error: "samples must be 3-10 and warmups 1-3" }, { status: 400 });
    }

    const results = [];
    for (const iterations of ALLOWED_ITERATIONS) {
      for (let i = 0; i < warmups; i++) await derive(iterations);
      const timings = [];
      for (let i = 0; i < samples; i++) {
        const started = performance.now();
        await derive(iterations);
        timings.push(Number((performance.now() - started).toFixed(3)));
      }
      results.push({
        algorithm: "PBKDF2-HMAC-SHA256",
        iterations,
        samples,
        median_ms: Number(percentile(timings, 0.5).toFixed(3)),
        p95_ms: Number(percentile(timings, 0.95).toFixed(3)),
        min_ms: Number(Math.min(...timings).toFixed(3)),
        max_ms: Number(Math.max(...timings).toFixed(3)),
      });
    }
    return Response.json({
      mode: "local-workerd-estimate",
      note: "Local timing only; not Cloudflare production CPU-time evidence.",
      results,
    });
  },
};
