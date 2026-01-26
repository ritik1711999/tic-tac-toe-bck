import express from "express";
import { getRecommendations } from "../controllers/recommendationController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

// GET /api/recommendations - Get personalized AI recommendations
router.get("/", protect, getRecommendations);

export default router;
