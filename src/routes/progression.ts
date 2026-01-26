import { Router } from "express";
import {
  getMyProgression,
  markLevelUpSeen,
} from "../controllers/progressionController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.get("/me", protect, getMyProgression);
router.patch("/level-up-seen", protect, markLevelUpSeen);

export default router;
