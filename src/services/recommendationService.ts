import Game from "../models/Game";
import GameAnalysis from "../models/GameAnalysis";
import RecommendationCache, {
  IRecommendation,
} from "../models/RecommendationCache";
import { analyzeGamesAndRecommend } from "./geminiService";

interface GameStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageMovesCount: number;
  difficultyDistribution: Record<string, number>;
  recentTrend: "improving" | "stable" | "declining";
}

interface MoveAnalysisData {
  averageMoveQuality: number;
  averageTacticalScore: number;
  averageLongevityScore: number;
  averageVolatilityScore: number;
  totalExpirations: number;
  avgLifespan: number;
  commonWeakMoments: string[];
}

interface EnrichedAnalysisData {
  gameStats: GameStats;
  moveAnalysis: MoveAnalysisData;
}

export const recommendationService = {
  /**
   * Generate recommendations for a user
   * Uses caching pattern to prevent excessive API calls (24h cache)
   */
  async generateRecommendations(userId: string): Promise<IRecommendation[]> {
    try {
      // Check for existing valid cache
      const existingCache = await RecommendationCache.findOne({ userId });

      if (existingCache) {
        // Return if cache is valid and completed
        if (
          existingCache.status === "completed" &&
          existingCache.expiresAt > new Date()
        ) {
          return existingCache.recommendations;
        }

        // Wait for processing to complete (similar to analysisService pattern)
        if (existingCache.status === "processing") {
          const result = await this.waitForProcessing(userId);
          if (result) return result;
        }
      }

      // Start new recommendation generation
      await RecommendationCache.findOneAndUpdate(
        { userId },
        {
          userId,
          status: "processing",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
        { upsert: true, new: true },
      );

      // Fetch last 10 completed games with GameAnalysis
      const games = await Game.find({
        user: userId,
        status: "completed",
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (games.length === 0) {
        const defaultRecs = this.getDefaultRecommendations();
        await this.updateCache(userId, defaultRecs, "completed");
        return defaultRecs;
      }

      // Prepare enriched analysis data
      const enrichedData = await this.prepareEnrichedAnalysis(games);

      // Call Gemini for recommendations
      const recommendations = await analyzeGamesAndRecommend(enrichedData);

      // Update cache with results
      await this.updateCache(userId, recommendations, "completed");

      return recommendations;
    } catch (error) {
      console.error("Error generating recommendations:", error);

      // Update cache with failure status
      await RecommendationCache.findOneAndUpdate(
        { userId },
        {
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      );

      return this.getDefaultRecommendations();
    }
  },

  /**
   * Wait for concurrent processing to complete (30 second timeout)
   */
  async waitForProcessing(userId: string): Promise<IRecommendation[] | null> {
    const maxWaitTime = 30000; // 30 seconds
    const pollInterval = 1000; // 1 second
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      elapsed += pollInterval;

      const cache = await RecommendationCache.findOne({ userId });
      if (!cache) return null;

      if (cache.status === "completed" && cache.expiresAt > new Date()) {
        return cache.recommendations;
      }

      if (cache.status === "failed") {
        return null;
      }
    }

    return null;
  },

  /**
   * Update cache with recommendations
   */
  async updateCache(
    userId: string,
    recommendations: IRecommendation[],
    status: "completed" | "failed",
  ): Promise<void> {
    await RecommendationCache.findOneAndUpdate(
      { userId },
      {
        recommendations,
        status,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
      { upsert: true, new: true },
    );
  },

  /**
   * Prepare enriched analysis combining game stats and move-level data
   */
  async prepareEnrichedAnalysis(games: any[]): Promise<EnrichedAnalysisData> {
    // Calculate game-level statistics
    const gameStats: GameStats = {
      totalGames: games.length,
      wins: games.filter((g) => g.outcome === "win").length,
      losses: games.filter((g) => g.outcome === "lose").length,
      draws: games.filter((g) => g.outcome === "draw").length,
      winRate: 0,
      averageMovesCount: 0,
      difficultyDistribution: {},
      recentTrend: "stable",
    };

    gameStats.winRate = (gameStats.wins / games.length) * 100;

    // Calculate difficulty distribution
    games.forEach((g) => {
      const difficulty = g.difficulty || "medium";
      gameStats.difficultyDistribution[difficulty] =
        (gameStats.difficultyDistribution[difficulty] || 0) + 1;
    });

    // Determine recent trend (last 3 games)
    const recentGames = games.slice(0, 3);
    const recentWins = recentGames.filter((g) => g.outcome === "win").length;
    gameStats.recentTrend =
      recentWins >= 2 ? "improving" : recentWins === 1 ? "stable" : "declining";

    // Extract move-level analysis data from GameAnalysis
    const moveAnalysis = await this.extractMoveAnalysisData(games);

    return { gameStats, moveAnalysis };
  },

  /**
   * Extract move-level insights from GameAnalysis data
   */
  async extractMoveAnalysisData(games: any[]): Promise<MoveAnalysisData> {
    const gameIds = games.map((g) => g._id);
    const analyses = await GameAnalysis.find({
      gameId: { $in: gameIds },
      status: "completed",
    }).lean();

    if (analyses.length === 0) {
      // No analysis data available
      return {
        averageMoveQuality: 0,
        averageTacticalScore: 0,
        averageLongevityScore: 0,
        averageVolatilityScore: 0,
        totalExpirations: 0,
        avgLifespan: 0,
        commonWeakMoments: [],
      };
    }

    let totalMoveQuality = 0;
    let totalTacticalScore = 0;
    let totalLongevityScore = 0;
    let totalVolatilityScore = 0;
    let totalExpirations = 0;
    let totalLifespan = 0;
    let moveCount = 0;
    const weakMoments: string[] = [];

    analyses.forEach((analysis) => {
      const data = analysis.analysis;
      if (!data) return;

      // Extract move-level scores
      if (data.moves && Array.isArray(data.moves)) {
        data.moves.forEach((move: any) => {
          moveCount++;

          // Map quality to score
          const qualityScores: Record<string, number> = {
            excellent: 100,
            good: 75,
            suboptimal: 50,
            mistake: 25,
          };
          totalMoveQuality += qualityScores[move.quality] || 50;

          if (move.tacticalScore) totalTacticalScore += move.tacticalScore;
          if (move.longevityScore) totalLongevityScore += move.longevityScore;
          if (move.volatilityRisk) totalVolatilityScore += move.volatilityRisk;
        });
      }

      // Extract key moments (weak points)
      if (data.keyMoments && Array.isArray(data.keyMoments)) {
        data.keyMoments.forEach((moment: any) => {
          if (
            moment.description &&
            (moment.description.toLowerCase().includes("mistake") ||
              moment.description.toLowerCase().includes("weak") ||
              moment.description.toLowerCase().includes("poor"))
          ) {
            weakMoments.push(
              `Move ${moment.moveNumber}: ${moment.description}`,
            );
          }
        });
      }

      // Extract aging statistics
      if (data.agingStats) {
        totalExpirations += data.agingStats.totalExpirations || 0;
        totalLifespan += data.agingStats.avgLifespan || 0;
      }
    });

    const analysisCount = analyses.length;

    return {
      averageMoveQuality: moveCount > 0 ? totalMoveQuality / moveCount : 0,
      averageTacticalScore: moveCount > 0 ? totalTacticalScore / moveCount : 0,
      averageLongevityScore:
        moveCount > 0 ? totalLongevityScore / moveCount : 0,
      averageVolatilityScore:
        moveCount > 0 ? totalVolatilityScore / moveCount : 0,
      totalExpirations,
      avgLifespan: analysisCount > 0 ? totalLifespan / analysisCount : 0,
      commonWeakMoments: weakMoments.slice(0, 5), // Top 5 weak moments
    };
  },

  /**
   * Get default recommendations for new users
   */
  getDefaultRecommendations(): IRecommendation[] {
    return [
      {
        id: `rec-${Date.now()}-1`,
        title: "Start Your Journey!",
        description:
          "Play your first game to unlock personalized AI recommendations.",
        priority: "high",
        icon: "trending-up",
        category: "difficulty",
        action: {
          type: "play-game",
          label: "Play Now",
          difficulty: "medium",
        },
      },
    ];
  },
};
