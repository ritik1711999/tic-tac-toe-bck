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
  // Map of gameId → NodeJS.Timeout for active turn timers
  private gameTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
    this.setupSocketEvents();
  }

  /** Clear any existing timeout for a game */
  private clearGameTimer(gameId: string) {
    const existing = this.gameTimers.get(gameId);
    if (existing) {
      clearTimeout(existing);
      this.gameTimers.delete(gameId);
    }
  }

  /** Schedule a timeout for the active player's remaining time */
  private scheduleTimer(
    gameId: string,
    remainingMs: number,
    activePlayer: "X" | "O",
  ) {
    this.clearGameTimer(gameId);
    const timeout = setTimeout(async () => {
      try {
        await this.handleTimeout(gameId, activePlayer);
      } catch (err) {
        console.error("Timer timeout handler error:", err);
      }
    }, remainingMs);
    this.gameTimers.set(gameId, timeout);
  }

  /** Handle a player timing out — forfeit the game */
  private async handleTimeout(gameId: string, timedOutPlayer: "X" | "O") {
    this.clearGameTimer(gameId);
    const game = await Game.findById(gameId);
    if (!game || game.status !== "in-progress") return;

    // The timed-out player loses
    game.outcome = timedOutPlayer === "X" ? "lose" : "win";
    game.status = "completed";
    game.timeoutLoser = timedOutPlayer;
    if (timedOutPlayer === "X") {
      game.playerXTimeRemaining = 0;
    } else {
      game.playerOTimeRemaining = 0;
    }
    game.timerLastStartedAt = null;

    // Update total duration
    const elapsedSeconds = Math.floor(
      (Date.now() - game.createdAt.getTime()) / 1000,
    );
    if (elapsedSeconds > game.duration) {
      game.duration = elapsedSeconds;
    }
    await game.save();

    // Emit timer update with zeroed time
    this.io.to(gameId).emit("timer-update", {
      gameId,
      playerXTimeRemaining: game.playerXTimeRemaining,
      playerOTimeRemaining: game.playerOTimeRemaining,
      activePlayer: timedOutPlayer,
    });

    // Emit game-timeout event
    this.io.to(gameId).emit("game-timeout", {
      gameId,
      winner: timedOutPlayer === "X" ? "O" : "X",
      loser: timedOutPlayer,
      reason: "timeout",
    });

    // Update user stats & progression
    let updatedUser = null;
    let newAchievements: Array<{ achievementId: string; unlockedAt: Date }> =
      [];
    try {
      if (game.user && game.outcome) {
        updatedUser = await this.updateUserStats(
          game.user.toString(),
          game.outcome as any,
          game.difficulty,
        );
        if (updatedUser) {
          newAchievements = await achievementService.checkAndUnlockAchievements(
            game.user.toString(),
          );
        }
      }
    } catch (e) {
      console.error("Stats update failed on timeout:", e);
    }

    let leveledUp = false;
    let newSkill = null;
    let skillPoints = 0;
    let previousSkill = null;
    try {
      if (game.user && game.outcome) {
        const progressResult = await progressionService.applyGameResult(
          game.user.toString(),
          game.outcome as any,
        );
        leveledUp = progressResult.leveledUp ?? false;
        newSkill = progressResult.snapshot?.current?.label ?? null;
        skillPoints = progressResult.skillPoints ?? 0;
        previousSkill = progressResult.previousSkill ?? null;
      }
    } catch (e) {
      console.error("Progression update failed on timeout:", e);
    }

    const moves = await Move.find({ gameId }).sort({ moveNumber: 1 });
    const payload = {
      gameId,
      result: game.outcome,
      winningLine: null,
      stats: { moves: moves.length, duration: game.duration },
      leveledUp,
      newSkill,
      skillPoints,
      previousSkill,
      newAchievements,
    };
    this.io.to(gameId).emit("game-end", payload);
    if (game.user) {
      this.io.to(`user_${game.user.toString()}`).emit("game-end", payload);
    }
  }

  /** Deduct elapsed turn time from the active player and start the next player's clock.
   *  Returns the updated remaining times, or null if timer is not enabled. */
  private deductTimerOnMove(
    game: any,
    currentPlayer: "X" | "O",
  ): { playerXTimeRemaining: number; playerOTimeRemaining: number } | null {
    if (!game.timerEnabled) return null;

    const now = new Date();
    let elapsed = 0;
    if (game.timerLastStartedAt) {
      elapsed =
        (now.getTime() - new Date(game.timerLastStartedAt).getTime()) / 1000;
    }

    if (currentPlayer === "X") {
      game.playerXTimeRemaining = Math.max(
        0,
        game.playerXTimeRemaining - elapsed,
      );
    } else {
      game.playerOTimeRemaining = Math.max(
        0,
        game.playerOTimeRemaining - elapsed,
      );
    }

    // Start the next player's clock (will be set to null if game completes)
    const nextPlayer = currentPlayer === "X" ? "O" : "X";
    // For AI games, don't start AI clock (AI moves are instant), keep timerLastStartedAt null until it's X's turn again
    if (game.vs === "AI" && nextPlayer === "O") {
      game.timerLastStartedAt = null; // AI turn — no clock ticking
    } else {
      game.timerLastStartedAt = now;
    }

    return {
      playerXTimeRemaining: game.playerXTimeRemaining,
      playerOTimeRemaining: game.playerOTimeRemaining,
    };
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

      socket.on("join-game", async (data: { gameId: string }) => {
        const { gameId } = data;
        socket.join(gameId);
        console.log(`User ${socket.id} joined game ${gameId}`);

        // Schedule timer if game has an active timer and no timeout is already scheduled
        try {
          const game = await Game.findById(gameId);
          if (
            game &&
            game.timerEnabled &&
            game.status === "in-progress" &&
            game.timerLastStartedAt
          ) {
            const moves = await Move.find({ gameId }).sort({ moveNumber: 1 });
            const currentPlayer: "X" | "O" = moves.length % 2 === 0 ? "X" : "O";
            const elapsed =
              (Date.now() - new Date(game.timerLastStartedAt).getTime()) / 1000;
            const remaining =
              currentPlayer === "X"
                ? Math.max(0, game.playerXTimeRemaining - elapsed)
                : Math.max(0, game.playerOTimeRemaining - elapsed);

            // Only schedule if no timer is already running for this game
            if (!this.gameTimers.has(gameId)) {
              this.scheduleTimer(gameId, remaining * 1000, currentPlayer);
            }

            // Send initial timer state to the joining client
            socket.emit("timer-update", {
              gameId,
              playerXTimeRemaining:
                currentPlayer === "X" ? remaining : game.playerXTimeRemaining,
              playerOTimeRemaining:
                currentPlayer === "O" ? remaining : game.playerOTimeRemaining,
              activePlayer: currentPlayer,
            });
          }
        } catch (e) {
          console.error("Error initializing timer on join:", e);
        }
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

            // === Timer: deduct elapsed time from the current player ===
            const timerState = this.deductTimerOnMove(game, currentPlayer);

            const winner = gameEngine.checkWinner(playerBoard);
            const draw = !winner && gameEngine.isDraw(playerBoard);

            if (winner) {
              game.outcome = winner === "X" ? "win" : "lose";
              game.status = "completed";
              game.timerLastStartedAt = null; // Stop all clocks
              this.clearGameTimer(gameId);
              const winningLine = gameEngine.getWinningLine(playerBoard);
              if (winningLine) {
                game.winningLine = winningLine;
              }
            } else if (draw) {
              game.outcome = "draw";
              game.status = "completed";
              game.timerLastStartedAt = null;
              this.clearGameTimer(gameId);
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

            // === Timer: emit timer-update to clients ===
            if (timerState) {
              const nextPlayer: "X" | "O" = currentPlayer === "X" ? "O" : "X";
              this.io.to(gameId).emit("timer-update", {
                gameId,
                playerXTimeRemaining: timerState.playerXTimeRemaining,
                playerOTimeRemaining: timerState.playerOTimeRemaining,
                activePlayer: game.status === "completed" ? null : nextPlayer,
              });
            }

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

            // === Timer: schedule timeout for the next player's turn ===
            if (game.timerEnabled && game.status === "in-progress") {
              const nextPlayer: "X" | "O" = currentPlayer === "X" ? "O" : "X";
              const nextRemaining =
                nextPlayer === "X"
                  ? game.playerXTimeRemaining
                  : game.playerOTimeRemaining;
              // For AI games, don't schedule timeout for AI (it moves instantly)
              if (!(game.vs === "AI" && nextPlayer === "O")) {
                this.scheduleTimer(gameId, nextRemaining * 1000, nextPlayer);
              }
            }

            if (game.vs === "AI") {
              setImmediate(async () => {
                try {
                  const aiMaxDelaySeconds =
                    game.difficulty === "hard"
                      ? 5
                      : game.difficulty === "medium"
                        ? 10
                        : 30;
                  const aiDelaySeconds = Math.floor(
                    Math.random() * (aiMaxDelaySeconds + 1),
                  );
                  const aiDelayMs = aiDelaySeconds * 1000;

                  if (game.timerEnabled) {
                    const aiDeductionSeconds = aiDelaySeconds;
                    game.playerOTimeRemaining = Math.max(
                      0,
                      game.playerOTimeRemaining - aiDeductionSeconds,
                    );

                    if (game.playerOTimeRemaining <= 0) {
                      await game.save();
                      await this.handleTimeout(gameId, "O");
                      return;
                    }
                  }

                  if (aiDelayMs > 0) {
                    await new Promise((resolve) =>
                      setTimeout(resolve, aiDelayMs),
                    );
                  }

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
                    game.timerLastStartedAt = null; // Stop clocks
                    this.clearGameTimer(gameId);
                    const winningLine = gameEngine.getWinningLine(aiBoardFinal);
                    if (winningLine) {
                      game.winningLine = winningLine;
                    }
                  } else if (aiDraw) {
                    game.outcome = "draw";
                    game.status = "completed";
                    game.timerLastStartedAt = null;
                    this.clearGameTimer(gameId);
                  } else if (game.timerEnabled) {
                    // Game continues — start player X's clock
                    game.timerLastStartedAt = new Date();
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

                  // === Timer: emit updated times after AI move ===
                  if (game.timerEnabled) {
                    this.io.to(gameId).emit("timer-update", {
                      gameId,
                      playerXTimeRemaining: game.playerXTimeRemaining,
                      playerOTimeRemaining: game.playerOTimeRemaining,
                      activePlayer: game.status === "completed" ? null : "X",
                    });

                    // Schedule player X timeout if game continues
                    if (game.status === "in-progress") {
                      this.scheduleTimer(
                        gameId,
                        game.playerXTimeRemaining * 1000,
                        "X",
                      );
                    }
                  }

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
