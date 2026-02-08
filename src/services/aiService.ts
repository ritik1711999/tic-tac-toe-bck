import { gameEngine } from "./gameEngine";

export class AIService {
  private difficultyDepths = {
    easy: 1,
    medium: 3,
    hard: 5,
  };

  getBestMove(board: string[], difficulty: "easy" | "medium" | "hard"): number {
    const depth = this.difficultyDepths[difficulty];
    const bestMove = this.minimax(board, depth, true);
    return bestMove.index;
  }

  private minimax(
    board: string[],
    depth: number,
    isMaximizing: boolean,
  ): { score: number; index: number } {
    const winner = gameEngine.checkWinner(board);
    if (winner === "O") return { score: 10, index: -1 };
    if (winner === "X") return { score: -10, index: -1 };
    if (gameEngine.isDraw(board) || depth === 0) return { score: 0, index: -1 };

    const availableMoves = gameEngine.getAvailableMoves(board);
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let bestIndex = -1;

    for (const move of availableMoves) {
      const newBoard = [...board];
      newBoard[move] = isMaximizing ? "O" : "X";
      const score = this.minimax(newBoard, depth - 1, !isMaximizing).score;
      if (isMaximizing && score > bestScore) {
        bestScore = score;
        bestIndex = move;
      } else if (!isMaximizing && score < bestScore) {
        bestScore = score;
        bestIndex = move;
      }
    }

    return { score: bestScore, index: bestIndex };
  }

  getSuggestions(board: string[]): {
    position: number;
    confidence: number;
    strategy: string;
    moveType: string;
  } {
    // Always use hard depth (5) for hint suggestions to ensure optimal moves
    const depth = 5;
    const availableMoves = gameEngine.getAvailableMoves(board);

    if (availableMoves.length === 0) {
      throw new Error("No available moves");
    }

    // Evaluate all available moves with minimax
    const moveScores = availableMoves.map((move) => {
      const newBoard = [...board];
      newBoard[move] = "O"; // AI's potential move
      const score = this.minimax(newBoard, depth - 1, false).score;
      return { move, score };
    });

    // Sort by score descending (best moves first)
    moveScores.sort((a, b) => b.score - a.score);
    const bestMove = moveScores[0];
    const secondBestScore =
      moveScores.length > 1 ? moveScores[1].score : bestMove.score;

    // Determine move type and strategy
    const { moveType, strategy } = this.classifyMove(board, bestMove.move);

    // Calculate confidence based on score and difference from second-best
    const scoreDifference = bestMove.score - secondBestScore;
    let confidence = 0;

    if (bestMove.score === 10) {
      // Winning move
      confidence = 100;
    } else if (bestMove.score === -10) {
      // Blocking a loss (defensive but necessary)
      confidence = 95;
    } else if (scoreDifference >= 5) {
      // Clear advantage
      confidence = 85;
    } else if (scoreDifference >= 2) {
      // Moderate advantage
      confidence = 75;
    } else {
      // Minor advantage or neutral
      confidence = 65;
    }

    return {
      position: bestMove.move,
      confidence: Math.min(100, Math.max(60, confidence)), // Clamp between 60-100
      strategy,
      moveType,
    };
  }

  private classifyMove(
    board: string[],
    position: number,
  ): { moveType: string; strategy: string } {
    // Check for various move patterns
    const boardAfterMove = [...board];
    boardAfterMove[position] = "O";

    // Check if this move wins
    if (gameEngine.checkWinner(boardAfterMove) === "O") {
      return {
        moveType: "Winning Move",
        strategy: "This move will give you the victory! Take it immediately.",
      };
    }

    // Check if blocking a loss
    const boardAfterHumanMove = [...board];
    boardAfterHumanMove[position] = "X";
    if (gameEngine.checkWinner(boardAfterHumanMove) === "X") {
      return {
        moveType: "Defensive Block",
        strategy:
          "Opponent can win on next turn if you don't take this cell. Block them now.",
      };
    }

    // Center control (position 4)
    if (position === 4) {
      return {
        moveType: "Center Control",
        strategy:
          "The center is the most strategically powerful position. It opens multiple winning paths.",
      };
    }

    // Corner positions (0, 2, 6, 8)
    if ([0, 2, 6, 8].includes(position)) {
      const currentCorners = [0, 2, 6, 8].filter(
        (c) => boardAfterMove[c] === "O",
      ).length;
      return {
        moveType: "Corner Strategy",
        strategy: `Corner positions are strong. This move gives you presence in key strategic areas.`,
      };
    }

    // Edge positions (1, 3, 5, 7)
    return {
      moveType: "Positional Play",
      strategy:
        "This move builds board presence and prepares for future winning combinations.",
    };
  }
}

export const aiService = new AIService();
