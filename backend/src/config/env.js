import "dotenv/config";
import { isAbsolute } from "node:path";

const nodeEnv = process.env.NODE_ENV || "development";
const port = Number.parseInt(process.env.PORT || "4000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const configuredOrigins = (process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
const localOrigins = nodeEnv === "production" ? [] : [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];
const databasePath = (process.env.SQLITE_PATH || "./data/nexus.sqlite").trim();
const corsOrigins = [...new Set([...configuredOrigins, ...localOrigins])];

if (nodeEnv === "production") {
  if (!process.env.CORS_ORIGINS?.trim()) throw new Error("CORS_ORIGINS must be explicitly configured in production.");
  if (corsOrigins.some(origin => !origin.startsWith("https://"))) throw new Error("Production CORS_ORIGINS must contain HTTPS origins only.");
  if (!isAbsolute(databasePath)) throw new Error("SQLITE_PATH must be an absolute persistent-volume path in production.");
}

export const env = Object.freeze({
  nodeEnv,
  port,
  databasePath,
  backupPath: process.env.SQLITE_BACKUP_DIR?.trim() || "./backups",
  corsOrigins
});
