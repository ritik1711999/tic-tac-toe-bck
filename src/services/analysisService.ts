import Game from "../models/Game";
import GameAnalysis from "../models/GameAnalysis";
import Move from "../models/Move";
import { generateAnalysisWithGemini } from "./geminiService";

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

/**
 * Build analysis context from game data
 * Returns move contexts and metadata needed for Gemini analysis
 */
async function buildAnalysisContext(gameId: string): Promise<{
  moveContexts: AnalysisMove[];
  maxAge: number;
  totalMoves: number;
  totalExpirations: number;
  avgLifespan: number;
  durationSeconds: number;
  outcome: string;
  title: string;
}> {
  const game = await Game.findById(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const moves = await Move.find({ gameId }).sort({ moveNumber: 1 });
  const maxAge = game.maxAge || 5;
  const totalMoves = moves.length;

  const moveContexts: AnalysisMove[] = [];
  let board: string[] = Array(9).fill("");
  let totalExpirations = 0;
  const lifespans: number[] = [];

  moves.forEach((m) => {
    const before = [...board];
    if (m.position >= 0 && m.position < 9) {
      board[m.position] = m.player;
    }
    const after = [...board];

    const expiresOnMove =
      m.expiresOnMove ?? (m.moveNumber ? m.moveNumber + maxAge : null);
    const expiredOnMove = m.expiredOnMove ?? null;
    const isExpired = expiredOnMove !== null;
    const lifespan = isExpired
      ? (expiredOnMove ?? totalMoves) - (m.moveNumber ?? 0)
      : expiresOnMove
        ? expiresOnMove - (m.moveNumber ?? 0)
        : maxAge;

    if (isExpired) {
      totalExpirations++;
    }
    lifespans.push(lifespan);

    const agingRisk = Math.max(0, 100 - (lifespan / maxAge) * 100);

    moveContexts.push({
      moveNumber: m.moveNumber,
      player: m.player,
      position: m.position,
      boardBefore: before,
      boardAfter: after,
      timestamp: m.createdAt?.toISOString?.() || new Date().toISOString(),
      expiresOnMove,
      expiredOnMove,
      isExpired,
      lifespan,
      agingRisk,
    });
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

  return {
    moveContexts,
    maxAge,
    totalMoves,
    totalExpirations,
    avgLifespan,
    durationSeconds,
    outcome: game.outcome || "draw",
    title,
  };
}

/**
 * Get or generate game analysis, using cache when available
 * Prevents duplicate Gemini API calls and stores analysis in database
 */
export async function getOrGenerateAnalysis(gameId: string) {
  try {
    // Try to fetch existing analysis from database
    const existingAnalysis = await GameAnalysis.findOne({
      gameId,
      status: { $in: ["completed", "processing"] },
    });

    // If analysis exists and is completed, return it immediately
    if (
      existingAnalysis &&
      existingAnalysis.status === "completed" &&
      existingAnalysis.analysis
    ) {
      return {
        cached: true,
        data: existingAnalysis.analysis,
        generatedAt: existingAnalysis.generatedAt,
      };
    }

    // If analysis is being processed, wait briefly before checking again
    // This prevents duplicate concurrent Gemini API calls
    if (existingAnalysis && existingAnalysis.status === "processing") {
      // Wait up to 30 seconds for processing to complete
      let attempts = 0;
      while (attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        const updated = await GameAnalysis.findById(existingAnalysis._id);
        if (updated?.status === "completed" && updated.analysis) {
          return {
            cached: true,
            data: updated.analysis,
            generatedAt: updated.generatedAt,
          };
        }
        attempts++;
      }
      // If still processing after 30 seconds, proceed to generate new one
    }

    // Mark as processing to prevent concurrent calls
    let analysisDoc = await GameAnalysis.findOneAndUpdate(
      { gameId },
      {
        $set: {
          gameId,
          status: "processing",
          generatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    // Build analysis context from game and moves
    const context = await buildAnalysisContext(gameId);

    // Generate new analysis using Gemini
    const geminiResult = await generateAnalysisWithGemini({
      gameTitle: context.title,
      gameResult: context.outcome,
      durationSeconds: context.durationSeconds,
      maxAge: context.maxAge,
      totalMoves: context.totalMoves,
      totalExpirations: context.totalExpirations,
      moves: context.moveContexts,
    });

    // Update database with completed analysis
    analysisDoc = (await GameAnalysis.findByIdAndUpdate(
      analysisDoc._id,
      {
        analysis: geminiResult,
        status: "completed",
        errorMessage: null,
      },
      { new: true },
    )) as any;

    return {
      cached: false,
      data: geminiResult,
      generatedAt: analysisDoc?.generatedAt,
      context, // Return context for controller to use
    };
  } catch (error) {
    // Update database to mark as failed
    await GameAnalysis.findOneAndUpdate(
      { gameId },
      {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
      { upsert: true },
    );

    // Re-throw the error for controller to handle
    throw error;
  }
}
