import { createCipheriv,createDecipheriv,randomBytes } from "node:crypto";
import { createMikroTikAdapter,safeRouterError } from "../services/mikrotik-api.js";
import { permissionFor } from "../lib/permissions.js";
const b64=b=>Buffer.from(b).toString("base64url");
function key(){const raw=process.env.ROUTER_CREDENTIAL_KEY||"";if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error("ROUTER_CREDENTIAL_KEY must be a 32-byte hex secret.");return Buffer.from(raw,"hex");}
function encrypt(value){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv),data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [b64(iv),b64(cipher.getAuthTag()),b64(data)].join(".");}
function decrypt(value){const [iv,tag,data]=value.split("."),d=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url"));d.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([d.update(Buffer.from(data,"base64url")),d.final()]).toString("utf8");}
export const credentialCrypto={encrypt,decrypt};
