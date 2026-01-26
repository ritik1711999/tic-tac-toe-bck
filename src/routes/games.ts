import express from "express";
import { body } from "express-validator";
import {
  createGame,
  getGameById,
  getGameMoves,
  getGameAnalysis,
  getRecentGames,
  getPaginatedGames,
  getHistoryStats,
} from "../controllers/gameController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

// GET /api/games/history - Get paginated games with filters and search
router.get("/history", protect, getPaginatedGames);

// GET /api/games/history/stats - Aggregate performance stats for history filters
router.get("/history/stats", protect, getHistoryStats);

// GET /api/games/recent - Get recent completed games for the user
router.get("/recent", protect, getRecentGames);

// POST /api/games - Create a new game
router.post(
  "/",
  protect,
  [
    body("vs")
      .isIn(["AI", "Human"])
      .withMessage("vs must be either 'AI' or 'Human'"),
    body("difficulty")
      .optional()
      .isIn(["easy", "medium", "hard"])
      .withMessage("difficulty must be 'easy', 'medium', or 'hard'"),
    body("opponentId")
      .optional()
      .isMongoId()
      .withMessage("opponentId must be a valid MongoDB ID"),
  ],
  createGame,
);

// GET /api/games/:gameId - Get game by ID with moves and board state
router.get("/:gameId", protect, getGameById);

// GET /api/games/:gameId/moves - Get all moves for a game
router.get("/:gameId/moves", protect, getGameMoves);

// GET /api/games/:gameId/analysis - Generate and fetch game analysis
router.get("/:gameId/analysis", protect, getGameAnalysis);

export default router;
