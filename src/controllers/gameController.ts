import mongoose from "mongoose";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import Game from "../models/Game";
import Move from "../models/Move";
import { gameEngine } from "../services/gameEngine";
import {
  generateAnalysisWithGemini,
  GeminiAnalysisResult,
} from "../services/geminiService";
import { getOrGenerateAnalysis } from "../services/analysisService";

type RawGroup = {
  totalGames: number;
  wins: number;
  loses: number;
  draws: number;
  totalMoves: number;
  totalDuration: number;
};

type DerivedGroup = RawGroup & {
  winRate: number;
  avgMoves: number;
  avgDuration: number;
};

const emptyGroup: RawGroup = {
  totalGames: 0,
  wins: 0,
  loses: 0,
  draws: 0,
  totalMoves: 0,
  totalDuration: 0,
};

const withDerived = (group: RawGroup): DerivedGroup => {
  const winRate = group.totalGames ? (group.wins / group.totalGames) * 100 : 0;
  const avgMoves = group.totalGames ? group.totalMoves / group.totalGames : 0;
  const avgDuration = group.totalGames
    ? group.totalDuration / group.totalGames
    : 0;

  return { ...group, winRate, avgMoves, avgDuration };
};

type AnalysisMove = {
  moveNumber: number;
  player: "X" | "O";
  position: number;
  boardBefore: string[];
  boardAfter: string[];
  timestamp: string;
  expiresOnMove?: number | null;
  expiredOnMove?: number | null;
  isExpired?: boolean;
  lifespan?: number;
  agingRisk?: number;
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

// Helper function to convert winningLine indices to pattern name
const getWinningPatternName = (
  winningLine: number[] | undefined,
  outcome: string | undefined,
): string => {
  if (!winningLine || winningLine.length === 0) {
    return outcome === "draw" ? "Draw" : "Undecided";
  }

  const lineSet = new Set(winningLine);

  // Top row (0, 1, 2)
  if (lineSet.has(0) && lineSet.has(1) && lineSet.has(2)) return "Top Row";
  // Middle row (3, 4, 5)
  if (lineSet.has(3) && lineSet.has(4) && lineSet.has(5)) return "Middle Row";
  // Bottom row (6, 7, 8)
  if (lineSet.has(6) && lineSet.has(7) && lineSet.has(8)) return "Bottom Row";

  // Left column (0, 3, 6)
  if (lineSet.has(0) && lineSet.has(3) && lineSet.has(6)) return "Left Column";
  // Middle column (1, 4, 7)
  if (lineSet.has(1) && lineSet.has(4) && lineSet.has(7))
    return "Middle Column";
  // Right column (2, 5, 8)
  if (lineSet.has(2) && lineSet.has(5) && lineSet.has(8)) return "Right Column";

  // Top-left to bottom-right diagonal (0, 4, 8)
  if (lineSet.has(0) && lineSet.has(4) && lineSet.has(8)) return "Diagonal";
  // Top-right to bottom-left diagonal (2, 4, 6)
  if (lineSet.has(2) && lineSet.has(4) && lineSet.has(6))
    return "Anti-Diagonal";

  return "Win";
};

export const createGame = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { vs, difficulty, opponentId } = req.body;
  const userId = (req as any).user.id;

  try {
    // Validate that difficulty is provided when playing vs AI
    if (vs === "AI" && !difficulty) {
      return res.status(400).json({
        message: "Difficulty level is required when playing vs AI",
      });
    }

    // Create new game
    const DEFAULT_MAX_AGE: Record<"easy" | "medium" | "hard", number> = {
      easy: 7,
      medium: 5,
      hard: 4,
    };
    const game = await Game.create({
      user: userId,
      vs,
      difficulty: vs === "AI" ? difficulty : undefined,
      agingEnabled: true,
      maxAge:
        vs === "AI" && difficulty
          ? DEFAULT_MAX_AGE[difficulty as "easy" | "medium" | "hard"]
          : 5,
      status: "in-progress",
      duration: 0,
      opponentId: vs === "Human" ? opponentId : undefined,
    });

    // Populate user reference
    await game.populate("user", "name avatar");

    res.status(201).json(game);
  } catch (error) {
    console.error("Error creating game:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGameById = async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const userId = (req as any).user.id;

  try {
    const game = await Game.findById(gameId).populate("user", "name avatar");

    if (!game) {
      return res.status(404).json({ message: "Game not found" });
    }

    // Check authorization
    const isOwner = game.user._id.toString() === userId;
    const isOpponent = game.opponentId
      ? game.opponentId.toString() === userId
      : false;

    if (!isOwner && !isOpponent) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this game" });
    }

    // Calculate elapsed time if game is active
    if (game.status === "in-progress") {
      const elapsedSeconds = Math.floor(
        (Date.now() - game.createdAt.getTime()) / 1000,
      );
      if (elapsedSeconds > game.duration) {
        game.duration = elapsedSeconds;
        await game.save();
      }
    }

    // Fetch all moves for this game
    const moves = await Move.find({ gameId }).sort({ moveNumber: 1 });

    // Calculate current board state from moves, respecting aging expirations
    const totalMoves = moves.length;
    const board =
      totalMoves > 0
        ? gameEngine.getActiveBoardFromMoves(
            moves.map((m) => ({
              position: m.position,
              player: m.player,
              expiredOnMove: m.expiredOnMove ?? null,
            })),
            totalMoves,
          )
        : Array(9).fill("");

    // Calculate current player
    const currentPlayer = moves.length % 2 === 0 ? "X" : "O";

    // User is always X for now
    const userSymbol = "X";

    res.json({
      game,
      board,
      currentPlayer,
      moves: moves.map((move) => ({
        _id: move._id,
        gameId: move.gameId,
        moveNumber: move.moveNumber,
        position: move.position,
        isAiMove: move.isAiMove,
        player: move.player,
        expiresOnMove: move.expiresOnMove ?? null,
        expiredOnMove: move.expiredOnMove ?? null,
        expiredAt: move.expiredAt ?? null,
        timestamp: move.createdAt,
      })),
      userSymbol,
    });
  } catch (error) {
    console.error("Error fetching game:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGameMoves = async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const userId = (req as any).user.id;

  try {
    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({ message: "Game not found" });
    }

    // Check authorization
    const isOwner = game.user.toString() === userId;
    const isOpponent = game.opponentId
      ? game.opponentId.toString() === userId
      : false;

    if (!isOwner && !isOpponent) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this game" });
    }

    const moves = await Move.find({ gameId }).sort({ moveNumber: 1 });

    res.json({
      moves: moves.map((move) => ({
        _id: move._id,
        gameId: move.gameId,
        moveNumber: move.moveNumber,
        position: move.position,
        isAiMove: move.isAiMove,
        player: move.player,
        boardStateAfterMove: move.boardStateAfterMove,
        expiresOnMove: move.expiresOnMove ?? null,
        expiredOnMove: move.expiredOnMove ?? null,
        expiredAt: move.expiredAt ?? null,
        timestamp: move.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching moves:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGameAnalysis = async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const userId = (req as any).user.id;

  try {
    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({ message: "Game not found" });
    }

    const isOwner = game.user.toString() === userId;
    const isOpponent = game.opponentId
      ? game.opponentId.toString() === userId
      : false;

    if (!isOwner && !isOpponent) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this game" });
    }

    // Use analysis service to get or generate cached analysis
    const analysisResult = await getOrGenerateAnalysis(gameId.toString());
    const geminiResult = analysisResult.data;

    // Get moves for building response
    const moves = await Move.find({ gameId }).sort({ moveNumber: 1 });
    const moveContexts = moves.map((m, idx) => ({
      moveNumber: m.moveNumber,
      player: m.player,
      position: m.position,
      boardBefore: [],
      boardAfter: [],
      timestamp: m.createdAt?.toISOString?.() || new Date().toISOString(),
      expiresOnMove: m.expiresOnMove,
      expiredOnMove: m.expiredOnMove,
      lifespan:
        m.expiresOnMove && m.moveNumber
          ? m.expiresOnMove - m.moveNumber
          : undefined,
    }));

    const maxAge = game.maxAge || 5;
    const totalMoves = moves.length;

    // Calculate metrics from moves
    let totalExpirations = 0;
    const lifespans: number[] = [];
    moves.forEach((m) => {
      if (m.expiredOnMove !== null && m.expiredOnMove !== undefined) {
        totalExpirations++;
      }
      if (m.expiresOnMove && m.moveNumber) {
        lifespans.push(m.expiresOnMove - m.moveNumber);
      }
    });

    const avgLifespan =
      lifespans.length > 0
        ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length)
        : maxAge;

    const durationSeconds = game.duration || 0;
    const title =
      game.vs === "AI"
        ? `Player vs AI (${game.difficulty || "unknown"})`
        : `Player vs Human`;

    const moveQualityToBreakdownKey = (
      q: "excellent" | "good" | "suboptimal" | "mistake",
    ): keyof typeof geminiResult.breakdown => {
      switch (q) {
        case "excellent":
          return "excellent";
        case "good":
          return "good";
        case "suboptimal":
          return "suboptimal";
        default:
          return "mistakes";
      }
    };

    // Build frontend-aligned payload with aging context
    const movesForClient = geminiResult.moves.map(
      (m: (typeof geminiResult.moves)[0], index: number) => {
        const originalMoveContext =
          moveContexts[m.moveNumber - 1] || moveContexts[index];

        return {
          moveNumber: m.moveNumber,
          player: m.player,
          position: originalMoveContext?.position ?? m.positionLabel,
          positionLabel: m.positionLabel,
          timestamp: m.timestamp || originalMoveContext?.timestamp,
          quality: m.quality,
          score: m.score,
          tacticalScore: m.tacticalScore,
          longevityScore: m.longevityScore,
          volatilityRisk: m.volatilityRisk,
          aiRecommendation: m.aiRecommendation,
          reasoning: m.reasoning,
          alternativeMove: m.alternativeMove,
          outcomes: m.outcomes,
          boardState: m.boardState,
          expiresOnMove: m.expiresOnMove ?? originalMoveContext?.expiresOnMove,
          expiredOnMove: m.expiredOnMove ?? originalMoveContext?.expiredOnMove,
          lifespan: m.lifespan ?? originalMoveContext?.lifespan,
        };
      },
    );

    // If Gemini missed breakdown, recompute counts
    const breakdown = { ...geminiResult.breakdown };
    if (
      !breakdown.excellent &&
      !breakdown.good &&
      !breakdown.suboptimal &&
      !breakdown.mistakes
    ) {
      breakdown.excellent = 0;
      breakdown.good = 0;
      breakdown.suboptimal = 0;
      breakdown.mistakes = 0;
      movesForClient.forEach((m: any) => {
        const key = moveQualityToBreakdownKey(m.quality);
        breakdown[key] += 1;
      });
    }

    const responsePayload = {
      id: game._id.toString(),
      title,
      date: game.createdAt.toISOString(),
      result: game.outcome || "draw",
      duration: formatDuration(durationSeconds),
      winningLine: game.winningLine || null,
      moves: movesForClient,
      performanceMetrics: {
        overallScore: geminiResult.overallScore,
        breakdown,
        keyMoments: geminiResult.keyMoments || [],
      },
      agingMetrics: {
        maxAge,
        totalMoves,
        totalExpirations,
        avgLifespan,
        volatilityScore: geminiResult.agingStats?.volatilityScore ?? 0,
      },
      cached: analysisResult.cached,
    };

    res.json(responsePayload);
  } catch (error) {
    console.error("Error generating game analysis:", error);
    res.status(500).json({
      message: "Failed to generate analysis",
      detail: (error as Error).message,
    });
  }
};

export const getRecentGames = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Cap at 100

  try {
    // Fetch recent completed games for the user, sorted by creation date descending
    const games = await Game.find({
      user: userId,
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    // Fetch move counts for each game
    const moveCounts = await Move.aggregate([
      {
        $match: {
          gameId: {
            $in: games.map((g) => g._id),
          },
        },
      },
      {
        $group: {
          _id: "$gameId",
          count: { $sum: 1 },
        },
      },
    ]);

    const moveCountMap = new Map(
      moveCounts.map((mc) => [mc._id.toString(), mc.count]),
    );

    // Format response with required fields for UI display
    const formattedGames = games.map((game) => {
      const opponent =
        game.vs === "AI"
          ? `AI - ${game.difficulty ? game.difficulty.charAt(0).toUpperCase() + game.difficulty.slice(1) : "Unknown"}`
          : "Human";

      return {
        id: game._id.toString(),
        opponent,
        result: game.outcome || "draw",
        moves: moveCountMap.get(game._id.toString()) || 0,
        duration: formatDuration(game.duration),
        timestamp: game.createdAt,
        winningPattern: getWinningPatternName(game.winningLine, game.outcome),
      };
    });

    res.json({
      games: formattedGames,
      total: formattedGames.length,
    });
  } catch (error) {
    console.error("Error fetching recent games:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getPaginatedGames = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 100); // Cap at 100

  // Filter parameters
  const search = (req.query.search as string)?.toLowerCase() || "";
  const outcome = (req.query.outcome as string) || ""; // "win", "lose", "draw", or empty for all
  const difficulty = (req.query.difficulty as string) || ""; // "easy", "medium", "hard", or empty for all
  const duration = (req.query.duration as string) || ""; // "0-60", "60-180", "180-300", "300+"
  const dateFrom = req.query.dateFrom
    ? new Date(req.query.dateFrom as string)
    : null;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : null;

  try {
    // Build query filter
    const query: any = {
      user: userId,
      status: "completed",
    };

    // Apply outcome filter
    if (outcome && ["win", "lose", "draw"].includes(outcome)) {
      query.outcome = outcome;
    }

    // Apply difficulty filter (only for AI games)
    if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
      query.vs = "AI";
      query.difficulty = difficulty;
    }

    // Apply date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = dateFrom;
      }
      if (dateTo) {
        // Add 1 day to dateTo to include the entire day
        const endOfDay = new Date(dateTo);
        endOfDay.setDate(endOfDay.getDate() + 1);
        query.createdAt.$lt = endOfDay;
      }
    }

    // Fetch games with pagination
    const skip = (page - 1) * limit;
    const games = await Game.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    // Fetch total count for pagination metadata
    const totalCount = await Game.countDocuments(query);

    // Fetch move counts for each game
    const moveCounts = await Move.aggregate([
      {
        $match: {
          gameId: {
            $in: games.map((g) => g._id),
          },
        },
      },
      {
        $group: {
          _id: "$gameId",
          count: { $sum: 1 },
        },
      },
    ]);

    const moveCountMap = new Map(
      moveCounts.map((mc) => [mc._id.toString(), mc.count]),
    );

    // Format response with required fields for UI display
    const formattedGames = games
      .map((game) => {
        const opponent =
          game.vs === "AI"
            ? `AI - ${game.difficulty ? game.difficulty.charAt(0).toUpperCase() + game.difficulty.slice(1) : "Unknown"}`
            : "Human";

        const moves = moveCountMap.get(game._id.toString()) || 0;
        const durationStr = formatDuration(game.duration);

        // Apply search filter on formatted data
        if (search) {
          const searchableText = `${game.outcome} ${durationStr}`.toLowerCase();
          if (!searchableText.includes(search)) {
            return null;
          }
        }

        return {
          id: game._id.toString(),
          opponent,
          result: game.outcome || "draw",
          moves,
          duration: durationStr,
          timestamp: game.createdAt,
          winningPattern: getWinningPatternName(game.winningLine, game.outcome),
          durationSeconds: game.duration, // For client-side duration filtering
        };
      })
      .filter((game): game is Exclude<typeof game, null> => game !== null);

    // Apply duration filter on client-side (after move count fetch)
    let filteredGames = formattedGames;
    if (duration) {
      filteredGames = formattedGames.filter((game) => {
        const durationSecs = game.durationSeconds;
        switch (duration) {
          case "0-60":
            return durationSecs < 60;
          case "60-180":
            return durationSecs >= 60 && durationSecs < 180;
          case "180-300":
            return durationSecs >= 180 && durationSecs < 300;
          case "300+":
            return durationSecs >= 300;
          default:
            return true;
        }
      });
    }

    // Calculate if there are more pages
    const hasNextPage = skip + limit < totalCount;

    res.json({
      games: filteredGames,
      pageInfo: {
        currentPage: page,
        pageSize: limit,
        totalCount,
        hasNextPage,
      },
    });
  } catch (error) {
    console.error("Error fetching paginated games:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const DIFFICULTY_LEVELS: Array<"easy" | "medium" | "hard"> = [
  "easy",
  "medium",
  "hard",
];

const normalizeOutcomeCounts = (
  outcomeGroups: { _id: string; count: number }[],
) => {
  const base = { win: 0, lose: 0, draw: 0 };
  outcomeGroups.forEach((g) => {
    if (g._id === "win" || g._id === "lose" || g._id === "draw") {
      base[g._id] = g.count;
    }
  });
  return base;
};

const buildDifficultyStats = (
  difficultyGroups: {
    _id: string | null;
    games: number;
    wins: number;
    loses: number;
    draws: number;
  }[],
) =>
  DIFFICULTY_LEVELS.map((level) => {
    const stats = difficultyGroups.find((g) => g._id === level);
    return {
      level,
      games: stats?.games ?? 0,
      wins: stats?.wins ?? 0,
      loses: stats?.loses ?? 0,
      draws: stats?.draws ?? 0,
    };
  });

export const getHistoryStats = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const outcome = (req.query.outcome as string) || "";
  const difficulty = (req.query.difficulty as string) || "";
  const duration = (req.query.duration as string) || "";
  const dateFrom = req.query.dateFrom
    ? new Date(req.query.dateFrom as string)
    : null;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : null;

  try {
    const match: any = {
      user: new mongoose.Types.ObjectId(userId),
      status: "completed",
    };

    if (outcome && ["win", "lose", "draw"].includes(outcome)) {
      match.outcome = outcome;
    }

    if (difficulty && DIFFICULTY_LEVELS.includes(difficulty as any)) {
      match.vs = "AI";
      match.difficulty = difficulty;
    }

    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) {
        match.createdAt.$gte = dateFrom;
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setDate(endOfDay.getDate() + 1);
        match.createdAt.$lt = endOfDay;
      }
    }

    if (duration) {
      switch (duration) {
        case "0-60":
          match.duration = { $lt: 60 };
          break;
        case "60-180":
          match.duration = { $gte: 60, $lt: 180 };
          break;
        case "180-300":
          match.duration = { $gte: 180, $lt: 300 };
          break;
        case "300+":
          match.duration = { $gte: 300 };
          break;
        default:
          break;
      }
    }

    const [result] = await Game.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "moves",
          let: { gameId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$gameId", "$$gameId"] } } },
            { $count: "count" },
          ],
          as: "moveStats",
        },
      },
      {
        $addFields: {
          movesCount: {
            $ifNull: [{ $arrayElemAt: ["$moveStats.count", 0] }, 0],
          },
        },
      },
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                totalGames: { $sum: 1 },
                wins: {
                  $sum: { $cond: [{ $eq: ["$outcome", "win"] }, 1, 0] },
                },
                loses: {
                  $sum: { $cond: [{ $eq: ["$outcome", "lose"] }, 1, 0] },
                },
                draws: {
                  $sum: { $cond: [{ $eq: ["$outcome", "draw"] }, 1, 0] },
                },
                totalMoves: { $sum: "$movesCount" },
                totalDuration: { $sum: "$duration" },
              },
            },
          ],
          outcome: [
            {
              $group: {
                _id: "$outcome",
                count: { $sum: 1 },
              },
            },
          ],
          difficulty: [
            { $match: { vs: "AI", difficulty: { $in: DIFFICULTY_LEVELS } } },
            {
              $group: {
                _id: "$difficulty",
                games: { $sum: 1 },
                wins: {
                  $sum: { $cond: [{ $eq: ["$outcome", "win"] }, 1, 0] },
                },
                loses: {
                  $sum: { $cond: [{ $eq: ["$outcome", "lose"] }, 1, 0] },
                },
                draws: {
                  $sum: { $cond: [{ $eq: ["$outcome", "draw"] }, 1, 0] },
                },
              },
            },
          ],
        },
      },
    ]);

    const overallRaw =
      (result?.overall?.[0] as RawGroup | undefined) || emptyGroup;
    const overall = withDerived(overallRaw);

    const outcomeBreakdown = normalizeOutcomeCounts(result?.outcome || []);
    const byDifficulty = buildDifficultyStats(result?.difficulty || []);

    return res.json({
      ...overall,
      outcomeBreakdown,
      byDifficulty,
    });
  } catch (error) {
    console.error("Error fetching history stats:", error);
    res.status(500).json({ message: "Server error" });
  }
};
