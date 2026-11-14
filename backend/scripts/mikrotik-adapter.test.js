import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { credentialCrypto } from "../src/routes/mikrotik.routes.js";
import { safeRouterError } from "../src/services/mikrotik-api.js";
test("router credentials encrypt and decrypt with authenticated encryption",()=>{const a=credentialCrypto.encrypt("secret-router-password");assert.notEqual(a,"secret-router-password");assert.equal(credentialCrypto.decrypt(a),"secret-router-password");});
test("router encryption rejects modified ciphertext",()=>{const a=credentialCrypto.encrypt("secret");assert.throws(()=>credentialCrypto.decrypt(a.slice(0,-1)+"A"));});
test("router errors redact password-like values",()=>{assert.match(safeRouterError(new Error("login password=hunter2 rejected")),/password=\[REDACTED\]/);});
