import { Router } from "express";
import { protect } from "../middleware/authMiddleware";
import {
  getMyAchievements,
  markAchievementAsSeen,
} from "../controllers/achievementController";

const router = Router();

// GET /api/achievements/me - Get all achievements for current user with progress
router.get("/me", protect, getMyAchievements);

// PATCH /api/achievements/:achievementId/seen - Mark achievement as seen by user
router.patch("/:achievementId/seen", protect, markAchievementAsSeen);

export default router;
