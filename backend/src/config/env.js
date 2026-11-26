import "dotenv/config";
const port=Number.parseInt(process.env.PORT||"4000",10);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("PORT must be a valid TCP port.");
const configuredOrigins=(process.env.CORS_ORIGINS||"http://localhost:3000,http://127.0.0.1:5500,http://localhost:8080,http://127.0.0.1:8080").split(",").map(v=>v.trim()).filter(Boolean);
const localOrigins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
const routerCredentialKey=process.env.ROUTER_CREDENTIAL_KEY||"";
if(process.env.NODE_ENV==="production"){
  const hasUnsafeOrigin=configuredOrigins.some((origin)=>{
    try{
      const parsed=new URL(origin);
      return parsed.protocol!=="https:"||parsed.origin!==origin||Boolean(parsed.username||parsed.password);
    }catch{
      return true;
    }
  });
  if(hasUnsafeOrigin){
    throw new Error("CORS_ORIGINS must contain HTTPS origins only in production.");
  }
}
if(process.env.NODE_ENV==="production"&&!/^[a-f0-9]{64}$/i.test(routerCredentialKey)){
  throw new Error("ROUTER_CREDENTIAL_KEY must be configured as a 32-byte hex secret in production.");
}
const autoBillingEnabled=process.env.AUTO_BILLING_ENABLED==="true";
export const env=Object.freeze({autoBillingEnabled,geminiApiKey:process.env.GEMINI_API_KEY||"",geminiModel:process.env.GEMINI_MODEL||"gemini-2.5-flash",nodeEnv:process.env.NODE_ENV||"development",port,databasePath:process.env.SQLITE_PATH||"./data/nexus.sqlite",corsOrigins:[...new Set([...configuredOrigins,...localOrigins])],whatsappAccessToken:process.env.WHATSAPP_ACCESS_TOKEN||"",whatsappPhoneNumberId:process.env.WHATSAPP_PHONE_NUMBER_ID||"",whatsappApiVersion:process.env.WHATSAPP_API_VERSION||"v23.0",whatsappVerifyToken:process.env.WHATSAPP_VERIFY_TOKEN||"",whatsappAppSecret:process.env.WHATSAPP_APP_SECRET||"",routerCredentialKeyConfigured:/^[a-f0-9]{64}$/i.test(routerCredentialKey)});
