import { GoogleGenerativeAI } from "@google/generative-ai";

export type GeminiMove = {
  moveNumber: number;
  player: "X" | "O";
  position: number;
  boardBefore: string[];
  boardAfter: string[];
  timestamp?: string;
  expiresOnMove?: number | null; // Move at which this piece expires
  expiredOnMove?: number | null; // Move at which expiration occurred (null if still active)
  isExpired?: boolean; // Whether piece already expired
  lifespan?: number; // How many moves this piece survives
  agingRisk?: number; // Risk factor 0-100 based on lifespan
};

export type GeminiAnalysisResult = {
  moves: Array<{
    moveNumber: number;
    player: "X" | "O";
    positionLabel: string;
    timestamp?: string;
    quality: "excellent" | "good" | "suboptimal" | "mistake";
    score: number;
    tacticalScore?: number; // Tactical quality (0-100) before aging adjustment
    longevityScore?: number; // Longevity safety based on expiration (0-100)
    aiRecommendation: string;
    reasoning: string;
    alternativeMove: string | null;
    outcomes: { win: number; draw: number; lose: number };
    boardState: ("X" | "O" | "")[];
    expiresOnMove?: number | null;
    expiredOnMove?: number | null;
    lifespan?: number;
    volatilityRisk?: number; // Board volatility at this point (0-100)
  }>;
  keyMoments: Array<{ moveNumber: number; description: string }>;
  overallScore: number;
  breakdown: {
    excellent: number;
    good: number;
    suboptimal: number;
    mistakes: number;
  };
  agingStats?: {
    totalExpirations: number;
    avgLifespan: number;
    volatilityScore: number;
  };
};

const positionToLabel = (pos: number): string => {
  const labels = [
    "Top Left (1)",
    "Top Middle (2)",
    "Top Right (3)",
    "Middle Left (4)",
    "Center (5)",
    "Middle Right (6)",
    "Bottom Left (7)",
    "Bottom Middle (8)",
    "Bottom Right (9)",
  ];
  if (pos < 0 || pos > 8) return `Cell ${pos}`;
  return labels[pos];
};

const sanitizeJson = (raw: string): string => {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1];
  }
  return trimmed;
};

export const generateAnalysisWithGemini = async (params: {
  gameTitle: string;
  gameResult: string;
  durationSeconds: number;
  maxAge: number;
  totalMoves: number;
  totalExpirations: number;
  moves: GeminiMove[];
}): Promise<GeminiAnalysisResult> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const moveLines = params.moves
    .map((m) => {
      const before = m.boardBefore.join("") || "";
      const after = m.boardAfter.join("") || "";
      const lifespan =
        m.lifespan !== undefined ? ` | lifespan:${m.lifespan}moves` : "";
      const expiryInfo =
        m.expiredOnMove !== undefined && m.expiredOnMove !== null
          ? ` | EXPIRED@move${m.expiredOnMove}`
          : m.expiresOnMove !== undefined && m.expiresOnMove !== null
            ? ` | expiresAtMove:${m.expiresOnMove}`
            : "";
      return `#${m.moveNumber} Player ${m.player} cell${
        m.position
      }(${positionToLabel(
        m.position,
      )}) board:${before}->${after}${lifespan}${expiryInfo}`;
    })
    .join("\n");

  const agingContextInfo = `
AGING TIC-TAC-TOE RULES:
- MaxAge: ${params.maxAge} (each piece survives ${params.maxAge} moves)
- Total moves played: ${params.totalMoves}
- Total pieces expired: ${params.totalExpirations}
- Board volatility: ${params.totalExpirations > 0 ? "HIGH" : "LOW"} 

ANALYSIS FOCUS:
1. Assess each move's TACTICAL quality (0-100 without aging consideration)
2. Assess LONGEVITY safety (0-100: pieces with longer lifespan = safer; expiring soon = risky)
3. Compute blended SCORE = tactical*0.7 + longevity*0.3
4. Identify VOLATILITY RISK at each point (how many pieces expiring in next 2-3 moves)
5. Explain if expiration was INTENTIONAL (strategic reset) or MISTAKE (lost advantage)
6. Suggest ALTERNATIVES with longer lifespan when possible
7. Flag KEY MOMENTS: critical expirations, board chaos, strategic resets
`;

  const prompt = `You are an expert AGING TIC-TAC-TOE analyst/coach of X remember X is the user always give you analysis as per X even if you are analysizing O's Moves. This variant has move expiration—pieces disappear after N moves, creating strategic depth and risk management.
${agingContextInfo}

Game: ${params.gameTitle}
Result: ${params.gameResult}
DurationSeconds: ${params.durationSeconds}
Moves (ordered):\n${moveLines}

Analyze EACH move considering:
- Tactical soundness (control, blocking, setting up wins)
- Longevity (will this piece survive to matter? or expire soon?)
- Aging risk (is board becoming chaotic with expirations?)
- Expiration consequence (what happens when this expires?)

Return STRICT JSON:
{
  "moves": [
    {
      "moveNumber": number,
      "player": "X" | "O",
      "positionLabel": string,
      "timestamp": string,
      "quality": "excellent" | "good" | "suboptimal" | "mistake",
      "score": number (0-100, blended: tactical*0.7 + longevity*0.3),
      "tacticalScore": number (0-100, pure tactical without aging),
      "longevityScore": number (0-100, based on how long piece survives),
      "volatilityRisk": number (0-100, board chaos at this point),
      "aiRecommendation": "string (include aging awareness)",
      "reasoning": "string (explain tactical + longevity trade-off, mention if expired or expiring soon)",
      "alternativeMove": "string | null (prefer longer-lived alternatives if possible)",
      "outcomes": {"win": number, "draw": number, "lose": number}, // these are probabilies for win|draw| lose in terms of player X you have to calculate after every move
      "boardState": ["X"|"O"|""] (length 9, board AFTER this move),
      "expiresOnMove": number | null,
      "expiredOnMove": number | null,
      "lifespan": number (moves until expiration or already expired)
    }
  ],
  "keyMoments": [
    {"moveNumber": number, "description": "string (highlight critical expirations, strategic resets, chaos points)"}
  ],
  "overallScore": number (0-100, weighted by aging resilience),
  "breakdown": {"excellent": number, "good": number, "suboptimal": number, "mistakes": number},
  "agingStats": {
    "totalExpirations": number,
    "avgLifespan": number,
    "volatilityScore": number (0-100)
  }
}

KEY GUIDELINES:
- Always analyse from Player X's perspective to help them improve
- Quality reflects BLENDED score (tactical + longevity), not purely tactical
- "excellent": Tactically sound AND long-lived OR strategically intentional expiration
- "good": Solid move with acceptable aging trade-offs
- "suboptimal": Weak tactical OR risky expiration consequence
- "mistake": Poor tactical AND/OR piece expires removing key advantage
- Reasoning MUST mention expiration timing and implications
- AlternativeMove should show lifespan: "Center (5) - expires move 12" vs "Top Left (1) - expires move 9"
- KeyMoments: capture expiration turning points, board volatility peaks, strategic resets
- OverallScore: penalize if pieces expire removing winning chances; reward if aging managed well

Respond ONLY with JSON.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const cleaned = sanitizeJson(text);
  const parsed = JSON.parse(cleaned) as GeminiAnalysisResult;

  // Normalize and guard values
  const safeMoves = (parsed.moves || []).map((m) => {
    // Get the original move data from params to ensure expiration data is preserved
    const originalMove = params.moves[m.moveNumber - 1];

    return {
      moveNumber: m.moveNumber,
      player: m.player,
      positionLabel:
        m.positionLabel ||
        positionToLabel(params.moves[m.moveNumber - 1]?.position ?? 0),
      timestamp: m.timestamp,
      quality: (m.quality ||
        "good") as GeminiAnalysisResult["moves"][number]["quality"],
      score: Math.max(0, Math.min(100, m.score ?? 0)),
      tacticalScore: m.tacticalScore
        ? Math.max(0, Math.min(100, m.tacticalScore))
        : undefined,
      longevityScore: m.longevityScore
        ? Math.max(0, Math.min(100, m.longevityScore))
        : undefined,
      volatilityRisk: m.volatilityRisk
        ? Math.max(0, Math.min(100, m.volatilityRisk))
        : undefined,
      aiRecommendation: m.aiRecommendation || "",
      reasoning: m.reasoning || "",
      alternativeMove: m.alternativeMove ?? null,
      outcomes: m.outcomes || { win: 33, draw: 34, lose: 33 },
      boardState: (m.boardState?.length === 9
        ? m.boardState
        : params.moves[m.moveNumber - 1]?.boardAfter || Array(9).fill("")) as (
        | "X"
        | "O"
        | ""
      )[],
      // Use original move data for expiration info (fallback from params)
      expiresOnMove:
        m.expiresOnMove ?? originalMove?.expiresOnMove ?? undefined,
      expiredOnMove:
        m.expiredOnMove ?? originalMove?.expiredOnMove ?? undefined,
      lifespan: m.lifespan ?? originalMove?.lifespan ?? undefined,
    };
  });

  const breakdown = parsed.breakdown || {
    excellent: 0,
    good: 0,
    suboptimal: 0,
    mistakes: 0,
  };

  return {
    moves: safeMoves,
    keyMoments: parsed.keyMoments || [],
    overallScore: parsed.overallScore ?? 0,
    breakdown,
    agingStats: parsed.agingStats || {
      totalExpirations: params.totalExpirations,
      avgLifespan: params.maxAge,
      volatilityScore: params.totalExpirations > 0 ? 60 : 20,
    },
  };
};

/**
 * Analyze games and generate personalized recommendations
 */
export const analyzeGamesAndRecommend = async (enrichedData: {
  gameStats: {
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    difficultyDistribution: Record<string, number>;
    recentTrend: string;
  };
  moveAnalysis: {
    averageMoveQuality: number;
    averageTacticalScore: number;
    averageLongevityScore: number;
    averageVolatilityScore: number;
    totalExpirations: number;
    avgLifespan: number;
    commonWeakMoments: string[];
  };
}): Promise<any[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const { gameStats, moveAnalysis } = enrichedData;

  const prompt = `
You are a Tic-Tac-Toe strategy expert. Analyze the following player statistics and provide 2-3 actionable recommendations to help them improve.

GAME-LEVEL STATISTICS:
- Total Games: ${gameStats.totalGames}
- Win Rate: ${gameStats.winRate.toFixed(1)}%
- Wins: ${gameStats.wins}, Losses: ${gameStats.losses}, Draws: ${gameStats.draws}
- Recent Trend: ${gameStats.recentTrend}
- Difficulty Distribution: ${JSON.stringify(gameStats.difficultyDistribution)}

MOVE-LEVEL ANALYSIS:
- Average Move Quality: ${moveAnalysis.averageMoveQuality.toFixed(1)}/100
- Average Tactical Score: ${moveAnalysis.averageTacticalScore.toFixed(1)}/100
- Average Longevity Score: ${moveAnalysis.averageLongevityScore.toFixed(1)}/100
- Average Volatility: ${moveAnalysis.averageVolatilityScore.toFixed(1)}/100
- Total Expirations: ${moveAnalysis.totalExpirations}
- Average Piece Lifespan: ${moveAnalysis.avgLifespan.toFixed(1)} moves
${moveAnalysis.commonWeakMoments.length > 0 ? `\nCOMMON WEAK MOMENTS:\n${moveAnalysis.commonWeakMoments.join("\n")}` : ""}

Provide recommendations in this EXACT JSON format (no markdown, no code fences):
{
  "recommendations": [
    {
      "title": "string (concise, 3-7 words)",
      "description": "string (specific actionable advice, 15-25 words)",
      "priority": "high|medium|low",
      "category": "difficulty|strategy|opening|defense|endgame",
      "actionType": "play-game|view-analysis",
      "actionLabel": "string (button text, e.g., 'Try Hard Mode', 'Start Practice', 'View Analysis')",
      "difficulty": "easy|medium|hard (ONLY if actionType is play-game, otherwise omit)"
    }
  ]
}

ACTION RULES:
- If actionType is "play-game": Set difficulty based on win rate and actionLabel (e.g., "Try Hard Mode", "Practice on Easy")
- If actionType is "view-analysis": Omit difficulty field, set actionLabel to "View Game Analysis"

RECOMMENDATION GUIDELINES:
1. Win rate < 40% → Recommend easier difficulty or practice (actionType: play-game, difficulty: easy)
2. Win rate 40-70% → Recommend tactical improvements (actionType: view-analysis or play-game with current difficulty)
3. Win rate > 70% → Challenge with harder difficulty (actionType: play-game, difficulty: hard)
4. Low tactical scores → Focus on opening/defense strategy (actionType: view-analysis)
5. High volatility → Focus on longevity/defensive play (actionType: view-analysis)
6. Specific weak moments → Target those areas (opening/defense/endgame category)

Prioritize:
- high: Critical issues affecting win rate or major tactical gaps
- medium: Strategic improvements that could enhance performance
- low: Advanced optimizations or difficulty progression

Provide 2-3 recommendations, prioritizing the most impactful improvements.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Parse the response
  return parseRecommendationResponse(text);
};

/**
 * Parse and sanitize Gemini recommendation response
 */
function parseRecommendationResponse(geminiText: string): any[] {
  try {
    const sanitized = sanitizeJson(geminiText);
    const parsed = JSON.parse(sanitized);

    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      throw new Error("Invalid recommendation format");
    }

    const iconMap: Record<string, string> = {
      difficulty: "trending-up",
      strategy: "target",
      opening: "lightbulb",
      defense: "shield",
      endgame: "target",
    };

    const recommendations = parsed.recommendations.map(
      (rec: any, index: number) => {
        return {
          id: `rec-${Date.now()}-${index}`,
          title: rec.title || "Improve Your Game",
          description:
            rec.description || "Keep practicing to improve your skills.",
          priority: rec.priority || "medium",
          icon: iconMap[rec.category] || "lightbulb",
          category: rec.category || "strategy",
          action: {
            type: rec.actionType || "play-game",
            label: rec.actionLabel || "Play Now",
            difficulty: rec.difficulty || undefined,
          },
        };
      },
    );

    return recommendations.slice(0, 3); // Max 3 recommendations
  } catch (error) {
    console.error("Error parsing recommendation response:", error);
    return [];
  }
}
