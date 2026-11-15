import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";

const cases = [
  ["staging", new URL("../src/index.js", import.meta.url)],
  ["production", new URL("../src/production-worker.js", import.meta.url)]
];

function loadVerifier(source) {
  const verifyStart = source.indexOf("async function verifyJWT(");
  const verifyEnd = source.indexOf("\nfunction b64u(", verifyStart);
  const decodeStart = source.indexOf("function b64uDec(");
  const decodeEnd = source.indexOf("\nfunction getSec(", decodeStart);
  assert.ok(verifyStart >= 0 && verifyEnd > verifyStart, "verifyJWT function must exist");
  assert.ok(decodeStart >= 0 && decodeEnd > decodeStart, "base64url decoder must exist");
  const context = { crypto: webcrypto, TextEncoder, TextDecoder, atob, btoa, Date };
  runInNewContext(
    source.slice(decodeStart, decodeEnd) + "\n" +
    source.slice(verifyStart, verifyEnd) +
    "\nglobalThis.verifyJWT = verifyJWT;",
    context
  );
  return context.verifyJWT;
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function token(payload, secret = "test-only-secret-for-worker-jwt") {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signingInput = header + "." + body;
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return signingInput + "." + Buffer.from(signature).toString("base64url");
}

for (const [label, file] of cases) {
  test(label + " Worker rejects missing, malformed and expired JWT expiry", async () => {
    const source = await readFile(file, "utf8");
    assert.ok(source.includes("if(!Number.isSafeInteger(pl.exp)||pl.exp<=Date.now())return null"));
    assert.ok(!source.includes("if(pl.exp&&Date.now()>pl.exp)return null"));
    const verify = loadVerifier(source);
    const secret = "test-only-secret-for-worker-jwt";

    assert.notEqual(await verify(await token({ sub: "valid", exp: Date.now() + 60_000 }, secret), secret), null);
    assert.equal(await verify(await token({ sub: "expired", exp: Date.now() - 1 }, secret), secret), null);
    assert.equal(await verify(await token({ sub: "missing-exp" }, secret), secret), null);
    assert.equal(await verify(await token({ sub: "string-exp", exp: String(Date.now() + 60_000) }, secret), secret), null);
    assert.equal(await verify(await token({ sub: "unsafe-exp", exp: Number.MAX_SAFE_INTEGER + 1 }, secret), secret), null);

    const tampered = (await token({ sub: "tampered", exp: Date.now() + 60_000 }, secret)).split(".");
    tampered[2] = (tampered[2][0] === "A" ? "B" : "A") + tampered[2].slice(1);
    assert.equal(await verify(tampered.join("."), secret), null);
  });
}
