import { Server as SocketServer } from "socket.io";
import { aiService } from "./aiService";
import { gameEngine } from "./gameEngine";
import Game from "../models/Game";
import Move from "../models/Move";
import User from "../models/User";
import { progressionService } from "./progressionService";
import { achievementService } from "./achievementService";

export class SocketService {
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
    this.setupSocketEvents();
  }

  private async updateUserStats(
    userId: string,
    outcome: "win" | "lose" | "draw",
    difficulty?: string,
  ) {
    const user = await User.findById(userId);
    if (!user) return null;

    user.stats.gamesPlayed += 1;

    if (outcome === "win") {
      user.stats.totalWins += 1;
      user.stats.currentWinStreak += 1;
      // Update longest win streak if current exceeds it
      if (user.stats.currentWinStreak > user.stats.longestWinStreak) {
        user.stats.longestWinStreak = user.stats.currentWinStreak;
      }
      // Increment hard AI wins if applicable
      if (difficulty === "hard") {
        user.stats.expertAiWins += 1;
      }
      // Reset loss streak
      user.stats.currentLossStreak = 0;
    } else if (outcome === "lose") {
      user.stats.totalLoses += 1;
      user.stats.currentLossStreak += 1;
      // Reset win streak on loss
      user.stats.currentWinStreak = 0;
    } else if (outcome === "draw") {
      user.stats.totalDraws += 1;
      // Reset streaks on draw (non-win)
      user.stats.currentWinStreak = 0;
      user.stats.currentLossStreak = 0;
    }

    await user.save();
    return user;
  }

  private setupSocketEvents() {
    this.io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      // Join user-specific room for personal notifications
      const userId = socket.handshake.query.userId as string;
      if (userId) {
        socket.join(`user_${userId}`);
        console.log(`User ${socket.id} joined room user_${userId}`);
      }

      socket.on("join-game", (data: { gameId: string }) => {
        const { gameId } = data;
        socket.join(gameId);
        console.log(`User ${socket.id} joined game ${gameId}`);
      });

      socket.on(
        "make-move",
        async (data: { gameId: string; position: number; userId: string }) => {
          try {
            const { gameId, position, userId } = data;

            const game = await Game.findById(gameId);
            if (!game) {
              socket.emit("error", { message: "Game not found" });
              return;
            }

            // Calculate elapsed time and update duration
            const elapsedSeconds = Math.floor(
              (Date.now() - game.createdAt.getTime()) / 1000,
            );
            if (elapsedSeconds > game.duration) {
              game.duration = elapsedSeconds;
            }

            const isOwner = game.user.toString() === userId;
            const isOpponent = game.opponentId
              ? game.opponentId.toString() === userId
              : false;
            const isLocalHuman =
              game.vs === "Human" && !game.opponentId && isOwner;
            if (!isOwner && !isOpponent && !isLocalHuman) {
              socket.emit("error", { message: "Not authorized for this game" });
              return;
            }
            if (game.status === "completed" || game.status === "abandoned") {
              socket.emit("error", { message: "Game is not active" });
              return;
            }
            if (game.vs === "AI" && !game.difficulty) {
              socket.emit("error", { message: "AI difficulty not set" });
              return;
            }

            const moves = await Move.find({ gameId }).sort({ moveNumber: 1 });
            const currentMoveNumber = moves.length; // next move will be currentMoveNumber + 1
            // Build active board respecting any expired moves
            const board =
              currentMoveNumber > 0
                ? gameEngine.getActiveBoardFromMoves(
                    moves.map((m) => ({
                      position: m.position,
                      player: m.player,
                      expiredOnMove: m.expiredOnMove ?? null,
                    })),
                    currentMoveNumber,
                  )
                : Array(9).fill("");

            const currentPlayer = moves.length % 2 === 0 ? "X" : "O";
            const playerSymbol = isLocalHuman
              ? currentPlayer
              : isOwner
                ? "X"
                : "O";
            if (currentPlayer !== playerSymbol) {
              socket.emit("error", { message: "It is not your turn" });
              return;
            }

            const playerMove = gameEngine.applyMove(
              board,
              position,
              playerSymbol,
            );
            if (!playerMove.valid || !playerMove.board) {
              socket.emit("error", { message: "Invalid move" });
              return;
            }

            const moveNumber = currentMoveNumber + 1;
            const maxAge = game.maxAge ?? 5;

            // Determine which existing moves expire (including missed expirations from past moves)
            const toExpireIds: string[] = [];
            const toExpireSimple: Array<{
              position: number;
              player: "X" | "O";
            }> = [];
            for (const m of moves) {
              const expiresOnMove =
                m.expiresOnMove != null
                  ? m.expiresOnMove
                  : game.agingEnabled
                    ? m.moveNumber + maxAge
                    : null;
              // Check if move should expire (at or before current moveNumber)
              if (
                expiresOnMove != null &&
                expiresOnMove <= moveNumber &&
                m.expiredOnMove == null
              ) {
                toExpireIds.push(m._id.toString());
                toExpireSimple.push({ position: m.position, player: m.player });
              }
            }

            if (toExpireIds.length) {
              await Move.updateMany(
                { _id: { $in: toExpireIds } },
                {
                  $set: {
                    expiredOnMove: moveNumber,
                    expiredAt: new Date(),
                    expiredReason: "aging",
                  },
                },
              );
            }

            // Compute final board after applying player move and expirations
            const movesForBoard = moves.map((m) => ({
              moveNumber: m.moveNumber,
              position: m.position,
              player: m.player,
              expiredOnMove:
                (m.expiredOnMove ?? null) != null
                  ? m.expiredOnMove
                  : toExpireIds.includes(m._id.toString())
                    ? moveNumber
                    : null,
            }));
            const playerBoard = gameEngine.getActiveBoardFromMoves(
              [
                ...movesForBoard,
                {
                  moveNumber,
                  position,
                  player: playerSymbol,
                  expiredOnMove: null,
                },
              ],
              moveNumber,
            );

            const newMoveExpiresOn = game.agingEnabled
              ? moveNumber + maxAge
              : null;

            await Move.create({
              gameId,
              moveNumber,
              position,
              isAiMove: false,
              player: playerSymbol,
              boardStateBeforeMove: board.map((cell) =>
                cell === "" ? null : cell,
              ),
              boardStateAfterMove: playerBoard.map((cell) =>
                cell === "" ? null : cell,
              ),
              expiresOnMove: newMoveExpiresOn,
              status: "pending",
              attempts: 0,
            });

            const winner = gameEngine.checkWinner(playerBoard);
            const draw = !winner && gameEngine.isDraw(playerBoard);

            if (winner) {
              game.outcome = winner === "X" ? "win" : "lose";
              game.status = "completed";
              const winningLine = gameEngine.getWinningLine(playerBoard);
              if (winningLine) {
                game.winningLine = winningLine;
              }
            } else if (draw) {
              game.outcome = "draw";
              game.status = "completed";
            }

            await game.save();

            // Emit expiration events and aging state
            if (toExpireSimple.length) {
              this.io.to(gameId).emit("cell-expired", {
                gameId,
                expired: toExpireSimple,
              });
            }

            this.io.to(gameId).emit("aging-state", {
              gameId,
              cells: gameEngine.getAgingState(
                [
                  ...movesForBoard,
                  {
                    moveNumber,
                    position,
                    player: playerSymbol,
                    expiredOnMove: null,
                  },
                ],
                moveNumber,
                maxAge,
              ),
            });

            this.io.to(gameId).emit("game-update", {
              gameId,
              board: playerBoard,
              currentPlayer: currentPlayer === "X" ? "O" : "X",
              result: game.outcome,
              duration: game.duration,
            });

            if (game.status === "completed") {
              // Update user stats on game completion
              let updatedUser = null;
              let newAchievements: Array<{
                achievementId: string;
                unlockedAt: Date;
              }> = [];
              try {
                if (game.user && game.outcome) {
                  // Update stats (and streak logic)
                  updatedUser = await this.updateUserStats(
                    game.user.toString(),
                    game.outcome as any,
                    game.difficulty,
                  );

                  // Check for newly unlocked achievements
                  if (updatedUser) {
                    newAchievements =
                      await achievementService.checkAndUnlockAchievements(
                        game.user.toString(),
                      );
                  }
                }
              } catch (e) {
                console.error("Stats update failed:", e);
              }

              // Update user progression on game completion
              let leveledUp = false;
              let newSkill = null;
              let skillPoints = 0;
              let previousSkill = null;
              try {
                if (game.user && game.outcome) {
                  const progressResult =
                    await progressionService.applyGameResult(
                      game.user.toString(),
                      game.outcome as any,
                    );
                  leveledUp = progressResult.leveledUp ?? false;
                  newSkill = progressResult.snapshot?.current?.label ?? null;
                  skillPoints = progressResult.skillPoints ?? 0;
                  previousSkill = progressResult.previousSkill ?? null;
                }
              } catch (e) {
                console.error("Progression update failed:", e);
              }
              const payload = {
                gameId,
                result: game.outcome,
                winningLine: game.winningLine || null,
                stats: { moves: moveNumber, duration: game.duration },
                leveledUp,
                newSkill,
                skillPoints,
                previousSkill,
                newAchievements,
              };

              this.io.to(gameId).emit("game-end", payload);
              if (game.user) {
                this.io
                  .to(`user_${game.user.toString()}`)
                  .emit("game-end", payload);
              }
              return;
            }

            if (game.vs === "AI") {
              setImmediate(async () => {
                try {
                  const aiMove = aiService.getBestMove(
                    playerBoard,
                    game.difficulty || "easy",
                  );

                  const aiResult = gameEngine.applyMove(
                    playerBoard,
                    aiMove,
                    "O",
                  );
                  if (!aiResult.valid || !aiResult.board) {
                    socket.emit("error", { message: "AI move failed" });
                    return;
                  }

                  const aiMoveNumber = moveNumber + 1;
                  const aiToExpireIds: string[] = [];
                  const aiToExpireSimple: Array<{
                    position: number;
                    player: "X" | "O";
                  }> = [];
                  const allMovesAfterPlayer = await Move.find({ gameId }).sort({
                    moveNumber: 1,
                  });
                  for (const m of allMovesAfterPlayer) {
                    const expiresOnMove =
                      m.expiresOnMove != null
                        ? m.expiresOnMove
                        : game.agingEnabled
                          ? m.moveNumber + (game.maxAge ?? 5)
                          : null;
                    if (
                      expiresOnMove != null &&
                      expiresOnMove === aiMoveNumber &&
                      m.expiredOnMove == null
                    ) {
                      aiToExpireIds.push(m._id.toString());
                      aiToExpireSimple.push({
                        position: m.position,
                        player: m.player,
                      });
                    }
                  }

                  if (aiToExpireIds.length) {
                    await Move.updateMany(
                      { _id: { $in: aiToExpireIds } },
                      {
                        $set: {
                          expiredOnMove: aiMoveNumber,
                          expiredAt: new Date(),
                          expiredReason: "aging",
                        },
                      },
                    );
                  }

                  const movesForBoardAI = (
                    await Move.find({ gameId }).sort({ moveNumber: 1 })
                  ).map((m) => ({
                    moveNumber: m.moveNumber,
                    position: m.position,
                    player: m.player,
                    expiredOnMove: m.expiredOnMove ?? null,
                  }));

                  const aiBoardFinal = gameEngine.getActiveBoardFromMoves(
                    [
                      ...movesForBoardAI,
                      {
                        moveNumber: aiMoveNumber,
                        position: aiMove,
                        player: "O",
                        expiredOnMove: null,
                      },
                    ],
                    aiMoveNumber,
                  );

                  const aiMoveExpiresOn = game.agingEnabled
                    ? aiMoveNumber + (game.maxAge ?? 5)
                    : null;

                  await Move.create({
                    gameId,
                    moveNumber: aiMoveNumber,
                    position: aiMove,
                    isAiMove: true,
                    player: "O",
                    boardStateBeforeMove: playerBoard.map((cell) =>
                      cell === "" ? null : cell,
                    ),
                    boardStateAfterMove: aiBoardFinal.map((cell) =>
                      cell === "" ? null : cell,
                    ),
                    expiresOnMove: aiMoveExpiresOn,
                    status: "pending",
                    attempts: 0,
                  });

                  const aiWinner = gameEngine.checkWinner(aiBoardFinal);
                  const aiDraw = !aiWinner && gameEngine.isDraw(aiBoardFinal);

                  if (aiWinner) {
                    game.outcome = aiWinner === "O" ? "lose" : "win";
                    game.status = "completed";
                    const winningLine = gameEngine.getWinningLine(aiBoardFinal);
                    if (winningLine) {
                      game.winningLine = winningLine;
                    }
                  } else if (aiDraw) {
                    game.outcome = "draw";
                    game.status = "completed";
                  }

                  // Update duration for AI move
                  const aiElapsedSeconds = Math.floor(
                    (Date.now() - game.createdAt.getTime()) / 1000,
                  );
                  if (aiElapsedSeconds > game.duration) {
                    game.duration = aiElapsedSeconds;
                  }

                  await game.save();

                  this.io.to(gameId).emit("ai-move", {
                    gameId,
                    position: aiMove,
                    reasoning: "AI move",
                  });

                  if (aiToExpireSimple.length) {
                    this.io.to(gameId).emit("cell-expired", {
                      gameId,
                      expired: aiToExpireSimple,
                    });
                  }

                  this.io.to(gameId).emit("aging-state", {
                    gameId,
                    cells: gameEngine.getAgingState(
                      [
                        ...movesForBoardAI,
                        {
                          moveNumber: aiMoveNumber,
                          position: aiMove,
                          player: "O",
                          expiredOnMove: null,
                        },
                      ],
                      aiMoveNumber,
                      game.maxAge ?? 5,
                    ),
                  });

                  this.io.to(gameId).emit("game-update", {
                    gameId,
                    board: aiBoardFinal,
                    currentPlayer: "X",
                    result: game.outcome,
                    duration: game.duration,
                  });

                  if (game.status === "completed") {
                    // Update user stats on game completion (AI turn)
                    let updatedUser = null;
                    let newAchievements: Array<{
                      achievementId: string;
                      unlockedAt: Date;
                    }> = [];
                    try {
                      if (game.user && game.outcome) {
                        // Update stats (and streak logic)
                        updatedUser = await this.updateUserStats(
                          game.user.toString(),
                          game.outcome as any,
                          game.difficulty,
                        );

                        // Check for newly unlocked achievements
                        if (updatedUser) {
                          newAchievements =
                            await achievementService.checkAndUnlockAchievements(
                              game.user.toString(),
                            );
                        }
                      }
                    } catch (e) {
                      console.error("Stats update failed:", e);
                    }

                    // Update user progression on game completion (AI turn)
                    let leveledUp = false;
                    let newSkill = null;
                    let skillPoints = 0;
                    let previousSkill = null;
                    try {
                      if (game.user && game.outcome) {
                        const progressResult =
                          await progressionService.applyGameResult(
                            game.user.toString(),
                            game.outcome as any,
                          );
                        leveledUp = progressResult.leveledUp ?? false;
                        newSkill =
                          progressResult.snapshot?.current?.label ?? null;
                        skillPoints = progressResult.skillPoints ?? 0;
                        previousSkill = progressResult.previousSkill ?? null;
                      }
                    } catch (e) {
                      console.error("Progression update failed:", e);
                    }
                    const payload = {
                      gameId,
                      result: game.outcome,
                      winningLine: game.winningLine || null,
                      stats: { moves: aiMoveNumber, duration: game.duration },
                      leveledUp,
                      newSkill,
                      skillPoints,
                      previousSkill,
                      newAchievements,
                    };
                    this.io.to(gameId).emit("game-end", payload);
                    if (game.user) {
                      this.io
                        .to(`user_${game.user.toString()}`)
                        .emit("game-end", payload);
                    }
                  }
                } catch (aiError) {
                  console.error("Error in AI move:", aiError);
                  socket.emit("error", { message: "AI move error" });
                }
              });
            }
          } catch (error) {
            console.error("Error in make-move:", error);
            socket.emit("error", { message: "Move failed" });
          }
        },
      );

      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
      });
    });
  }
}
