import mongoose from "mongoose";
import { Request, Response } from "express";
import Game from "../models/Game";

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

type Delta = { abs: number; pct: number | null };

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

const deltaOf = (current: number, previous: number): Delta => {
  const abs = current - previous;
  const pct = previous > 0 ? (abs / previous) * 100 : null;
  return { abs, pct };
};

const computeStreak = (
  games: { outcome?: string | null }[],
): { count: number; outcome: string | null } => {
  if (!games.length) return { count: 0, outcome: null };

  let streakOutcome: string | null = games[0].outcome || null;
  let count = streakOutcome ? 1 : 0;

  for (let i = 1; i < games.length; i++) {
    const outcome = games[i].outcome || null;
    if (!outcome || outcome !== streakOutcome) break;
    count += 1;
  }

  return { count, outcome: streakOutcome };
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - 7);

    const previousStart = new Date(currentStart);
    previousStart.setDate(currentStart.getDate() - 7);

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Aggregate games from the last 14 days and bucket them into current vs previous week
    const grouped = await Game.aggregate([
      {
        $match: {
          user: userObjectId,
          status: "completed",
          createdAt: { $gte: previousStart },
        },
      },
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
          period: {
            $cond: [
              { $gte: ["$createdAt", currentStart] },
              "current",
              "previous",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$period",
          totalGames: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ["$outcome", "win"] }, 1, 0] } },
          loses: { $sum: { $cond: [{ $eq: ["$outcome", "lose"] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ["$outcome", "draw"] }, 1, 0] } },
          totalMoves: { $sum: "$movesCount" },
          totalDuration: { $sum: "$duration" },
        },
      },
    ]);

    const currentRaw = grouped.find((g) => g._id === "current") || emptyGroup;
    const previousRaw = grouped.find((g) => g._id === "previous") || emptyGroup;

    const current = withDerived(currentRaw as RawGroup);
    const previous = withDerived(previousRaw as RawGroup);

    const deltas = {
      totalGames: deltaOf(current.totalGames, previous.totalGames),
      winRate: deltaOf(current.winRate, previous.winRate),
      avgMoves: deltaOf(current.avgMoves, previous.avgMoves),
      avgDuration: deltaOf(current.avgDuration, previous.avgDuration),
    };

    // Streak is based on most recent completed games regardless of time window
    const recentGames = await Game.find({
      user: userObjectId,
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("outcome createdAt")
      .lean();

    const streak = computeStreak(recentGames);

    return res.json({ current, previous, deltas, streak });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
};
