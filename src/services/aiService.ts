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
    isMaximizing: boolean
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

  getSuggestions(
    board: string[],
    difficulty: "easy" | "medium" | "hard"
  ): { position: number; confidence: number; strategy: string }[] {
    // For simplicity, return top 3 moves with mock data
    const availableMoves = gameEngine.getAvailableMoves(board);
    return availableMoves.slice(0, 3).map((move) => ({
      position: move,
      confidence: Math.random() * 100,
      strategy: "Strategic move",
    }));
  }
}

export const aiService = new AIService();
