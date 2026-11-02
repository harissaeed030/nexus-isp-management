import "dotenv/config";

const port = Number.parseInt(process.env.PORT || "4000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  mongoUri: process.env.MONGODB_URI?.trim() || "",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
});
