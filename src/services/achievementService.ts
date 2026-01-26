import User, { IUser } from "../models/User";
import UserAchievement from "../models/UserAchievement";
import { ACHIEVEMENTS } from "../config/achievements";

export const achievementService = {
  async checkAndUnlockAchievements(userId: string) {
    const user = await User.findById(userId);
    if (!user) return [];

    const newAchievements: Array<{
      achievementId: string;
      unlockedAt: Date;
    }> = [];

    for (const achievementDef of ACHIEVEMENTS) {
      // Check if achievement is already unlocked
      const existingAchievement = await UserAchievement.findOne({
        userId,
        achievementId: achievementDef.id,
      });

      if (existingAchievement) {
        // Already unlocked
        continue;
      }

      // Check if condition is met
      if (achievementDef.condition(user)) {
        // Create new achievement record
        const userAchievement = await UserAchievement.create({
          userId,
          achievementId: achievementDef.id,
          unlockedAt: new Date(),
          seenByUser: false,
          seenAt: null,
        });

        newAchievements.push({
          achievementId: achievementDef.id,
          unlockedAt: userAchievement.unlockedAt,
        });
      }
    }

    return newAchievements;
  },

  async getUserAchievements(user: IUser) {
    // Get all completed achievements from DB
    const completedAchievements = await UserAchievement.find({
      userId: user._id,
    }).lean();

    const completedMap = new Map(
      completedAchievements.map((a) => [a.achievementId, a]),
    );

    // Combine config with DB records
    const achievements = ACHIEVEMENTS.map((achievementDef) => {
      const completed = completedMap.get(achievementDef.id);
      const progress = achievementDef.progress(user);
      const isUnlocked = !!completed;

      return {
        id: achievementDef.id,
        title: achievementDef.title,
        description: achievementDef.description,
        icon: achievementDef.icon,
        target: achievementDef.target,
        progress: progress,
        isUnlocked: isUnlocked,
        unlockedAt: completed?.unlockedAt || null,
        seenByUser: completed?.seenByUser || false,
        seenAt: completed?.seenAt || null,
      };
    });

    return achievements;
  },

  async markAchievementAsSeen(userId: string, achievementId: string) {
    return await UserAchievement.findOneAndUpdate(
      { userId, achievementId },
      {
        seenByUser: true,
        seenAt: new Date(),
      },
      { new: true },
    );
  },
};
