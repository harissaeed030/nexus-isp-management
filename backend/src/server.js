import app from "./app.js";
import { env } from "./config/env.js";
import { db } from "./config/database.js";

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "server_started", port: env.port, environment: env.nodeEnv }));
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", event: "server_shutdown", signal }));
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
