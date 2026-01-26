import { Request, Response } from "express";
import User from "../models/User";
import { achievementService } from "../services/achievementService";

export const getMyAchievements = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const achievements = await achievementService.getUserAchievements(user);

    res.json({
      achievements,
    });
  } catch (error) {
    console.error("Error fetching achievements:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const markAchievementAsSeen = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { achievementId } = req.params;

  if (!achievementId) {
    return res.status(400).json({ message: "achievementId is required" });
  }

  try {
    const result = await achievementService.markAchievementAsSeen(
      userId,
      achievementId,
    );

    if (!result) {
      return res.status(404).json({ message: "Achievement not found" });
    }

    res.json({
      message: "Achievement marked as seen",
      achievement: result,
    });
  } catch (error) {
    console.error("Error marking achievement as seen:", error);
    res.status(500).json({ message: "Server error" });
  }
};
