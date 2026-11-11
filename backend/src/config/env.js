import "dotenv/config";
const port=Number.parseInt(process.env.PORT||"4000",10);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("PORT must be a valid TCP port.");
const configuredOrigins=(process.env.CORS_ORIGINS||"http://localhost:3000,http://127.0.0.1:5500,http://localhost:8080,http://127.0.0.1:8080").split(",").map(v=>v.trim()).filter(Boolean);
const localOrigins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
export const env=Object.freeze({nodeEnv:process.env.NODE_ENV||"development",port,databasePath:process.env.SQLITE_PATH||"./data/nexus.sqlite",corsOrigins:[...new Set([...configuredOrigins,...localOrigins])],geminiApiKey:process.env.GEMINI_API_KEY||"",geminiModel:process.env.GEMINI_MODEL||"gemini-3.8-flash"});
