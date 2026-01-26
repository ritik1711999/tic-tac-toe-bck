import User from "../models/User";
import {
  POINT_REWARDS,
  STAGES,
  findStageForPoints,
  getNextStage,
  getProgressPercent,
} from "../config/progression";

type Outcome = keyof typeof POINT_REWARDS;

export const progressionService = {
  getProgressForPoints(points: number) {
    const current = findStageForPoints(points);
    const next = getNextStage(current);
    const progressPercent = getProgressPercent(points, current);
    const pointsToNextLevel =
      current.max == null ? 0 : Math.max(0, current.max - points);
    return { current, next, progressPercent, pointsToNextLevel };
  },

  async applyGameResult(userId: string, outcome: Outcome) {
    const reward = POINT_REWARDS[outcome] ?? 0;
    const user = await User.findById(userId);
    if (!user) return { updated: false, leveledUp: false };

    const prevPoints = user.skillPoints ?? 0;
    const newPoints = prevPoints + reward;
    user.skillPoints = newPoints;

    const prevLabel = user.currentSkill?.label ?? null;
    const { current, next, pointsToNextLevel } =
      this.getProgressForPoints(newPoints);

    user.currentSkill = {
      rank: current.rank,
      stage: current.stage,
      label: current.label,
    };
    user.nextSkill = next
      ? { rank: next.rank, stage: next.stage, label: next.label }
      : null;
    user.pointsToNextLevel = pointsToNextLevel;

    const leveledUp = prevLabel !== current.label;
    if (leveledUp) {
      user.currentSkillAchievedAt = new Date();
    }

    await user.save();
    return {
      updated: true,
      leveledUp,
      reward,
      snapshot: { current, next, pointsToNextLevel },
      skillPoints: newPoints,
      previousSkill: prevLabel,
    };
  },
};

export type ProgressionSnapshot = ReturnType<
  typeof progressionService.getProgressForPoints
>;
export const progressionConfig = { POINT_REWARDS, STAGES };
