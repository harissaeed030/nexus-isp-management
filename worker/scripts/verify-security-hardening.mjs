import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const staging=readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const production=readFileSync(new URL("../src/production-worker.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../cloudflare/d1/migrations/0022_security_hardening.sql",import.meta.url),"utf8");
for(const [name,source] of [["staging",staging],["production",production]]){
 assert.match(source,/PASSWORD_HASH_ITERATIONS=600000/,name+" PBKDF2 iterations");
 assert.match(source,/HASH_SEPARATOR=String.fromCharCode\(36\)/,name+" versioned hash separator");
 assert.doesNotMatch(source,/if\(!salt\)return pw===h/,name+" plaintext fallback");
 assert.match(source,/registrationRateLimited\(env,ip,attemptEmail\)/,name+" registration throttle");
 assert.match(source,/PPPOE_ENCRYPTION_KEY/,name+" separate PPPoE secret");
 assert.match(source,/return 'enc:v2:'/ ,name+" v2 ciphertext");
 assert.match(source,/'Cache-Control':'no-store'/,name+" no-store JSON");
 assert.match(source,/NEXUS-PPPOE-PASSWORD-ENCRYPTION'/,name+" legacy v1 HKDF compatibility");
}
assert.match(migration,/CREATE TABLE IF NOT EXISTS registration_attempts/);
assert.match(migration,/VALUES\\(22,'0022_security_hardening'/);
assert.doesNotMatch(migration,/trg_payment_promises_/,"security migration must not reference payment_promises before its table migration");
assert.doesNotMatch(migration,/VALUES\\((1[0-9]|2[01]),/,"migration ID must not collide with observed live IDs");
console.log("Security hardening source contracts passed; D1 migration uses unused version 0022.");
