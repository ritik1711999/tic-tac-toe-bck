export class GameEngine {
  private winningLines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // columns
    [0, 4, 8],
    [2, 4, 6], // diagonals
  ];

  getBoardFromMoves(
    moves: { position: number; player: "X" | "O" }[],
  ): string[] {
    const board = Array(9).fill("");
    moves.forEach((move) => {
      if (move.position >= 0 && move.position < 9) {
        board[move.position] = move.player;
      }
    });
    return board;
  }

  applyMove(
    board: string[],
    position: number,
    player: "X" | "O",
  ): { valid: boolean; board?: string[] } {
    if (position < 0 || position > 8) return { valid: false };
    if (board[position] !== "") return { valid: false };
    const next = [...board];
    next[position] = player;
    return { valid: true, board: next };
  }

  checkWinner(board: string[]): "X" | "O" | null {
    for (const line of this.winningLines) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a] as "X" | "O";
      }
    }
    return null;
  }

  getWinningLine(board: string[]): number[] | null {
    for (const line of this.winningLines) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return line;
      }
    }
    return null;
  }

  isDraw(board: string[]): boolean {
    return board.every((cell) => cell !== "") && !this.checkWinner(board);
  }

  getAvailableMoves(board: string[]): number[] {
    return board
      .map((cell, index) => (cell === "" ? index : -1))
      .filter((index) => index !== -1);
  }

  getActiveBoardFromMoves(
    moves: Array<{
      position: number;
      player: "X" | "O";
      expiredOnMove?: number | null;
    }>,
    currentMoveNumber: number,
  ): string[] {
    const activeMoves = moves.filter(
      (m) => m.expiredOnMove == null || m.expiredOnMove > currentMoveNumber,
    );
    return this.getBoardFromMoves(activeMoves);
  }

  getAgingState(
    moves: Array<{
      moveNumber: number;
      position: number;
      player: "X" | "O";
      expiredOnMove?: number | null;
    }>,
    currentMoveNumber: number,
    maxAge: number,
  ): Array<{
    position: number;
    player: "X" | "O";
    age: number;
    expiresIn: number;
  }> {
    const active = moves.filter(
      (m) => m.expiredOnMove == null || m.expiredOnMove > currentMoveNumber,
    );
    return active.map((m) => {
      const age = Math.max(1, currentMoveNumber - m.moveNumber + 1);
      const expiresOnMove = m.moveNumber + maxAge;
      const expiresIn = Math.max(0, expiresOnMove - currentMoveNumber);
      return { position: m.position, player: m.player, age, expiresIn };
    });
  }
}

export const gameEngine = new GameEngine();
