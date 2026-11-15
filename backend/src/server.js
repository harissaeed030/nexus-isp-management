import app from "./app.js";
import { env } from "./config/env.js";
import { db } from "./config/database.js";
import { startMonthlyBillingScheduler } from "./services/monthly-billing-scheduler.js";
const stopMonthlyBilling = startMonthlyBillingScheduler({ db, enabled: env.autoBillingEnabled });
const server=app.listen(env.port,"0.0.0.0",()=>console.log(`Nexus API listening at http://127.0.0.1:${env.port}`));
function shutdown(signal){console.log(`${signal} received. Closing Nexus API...`);stopMonthlyBilling();server.close(()=>{db.close();process.exit(0);});}
process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("SIGTERM",()=>shutdown("SIGTERM"));
