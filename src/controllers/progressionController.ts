import { Request, Response } from "express";
import User from "../models/User";
import { progressionService } from "../services/progressionService";

export const getMyProgression = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as string;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const snapshot = progressionService.getProgressForPoints(
      user.skillPoints ?? 0,
    );
    return res.json({
      skillPoints: user.skillPoints ?? 0,
      currentSkill: user.currentSkill ?? null,
      currentSkillAchievedAt: user.currentSkillAchievedAt ?? null,
      lastSeenLevelUpAt: user.lastSeenLevelUpAt ?? null,
      nextSkill: user.nextSkill ?? snapshot.next,
      pointsToNextLevel: user.pointsToNextLevel ?? snapshot.pointsToNextLevel,
      progressPercent: snapshot.progressPercent,
    });
  } catch (error) {
    console.error("Failed to fetch progression:", error);
    return res.status(500).json({ message: "Failed to fetch progression" });
  }
};

export const markLevelUpSeen = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as string;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.lastSeenLevelUpAt = new Date();
    await user.save();

    return res.json({ message: "Level-up modal marked as seen" });
  } catch (error) {
    console.error("Failed to mark level-up as seen:", error);
    return res.status(500).json({ message: "Failed to mark level-up seen" });
  }
};
