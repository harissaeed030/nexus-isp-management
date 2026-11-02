import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";

let server;

async function start() {
  try {
    await connectDatabase();
    server = app.listen(env.port, "0.0.0.0", () => {
      console.log(`Nexus API listening on port ${env.port}`);
    });
  } catch (error) {
    console.error("Nexus API startup failed:", error.message);
    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down Nexus API...`);
  if (server) {
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  } else {
    await disconnectDatabase();
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
