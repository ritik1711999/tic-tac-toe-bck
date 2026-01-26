import express from "express";
import { protect } from "../middleware/authMiddleware";
import { getDashboardStats } from "../controllers/dashboardController";

const router = express.Router();

// GET /api/dashboard/stats - Aggregated performance metrics for the user
router.get("/stats", protect, getDashboardStats);

export default router;
