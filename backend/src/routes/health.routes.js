import { Router } from "express";
import { getDatabaseStatus } from "../config/database.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "Nexus API",
    status: "running",
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString()
  });
});

export default router;
