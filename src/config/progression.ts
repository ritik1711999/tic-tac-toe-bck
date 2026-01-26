export type RankKey = "beginner" | "intermediate" | "advanced" | "master";

export type StageDef = {
  rank: RankKey;
  stage: 1 | 2 | 3;
  label: string;
  min: number; // inclusive
  max: number | null; // exclusive; null means top cap (no next)
};

export const POINT_REWARDS = {
  win: 25,
  lose: 10,
  draw: 10,
} as const;

// Config-driven progression ladder with three stages per rank.
// Ranges after Intermediate 2 ramp up aggressively through Master.
export const STAGES: StageDef[] = [
  { rank: "beginner", stage: 1, label: "Beginner 1", min: 0, max: 100 },
  { rank: "beginner", stage: 2, label: "Beginner 2", min: 100, max: 300 },
  { rank: "beginner", stage: 3, label: "Beginner 3", min: 300, max: 600 },
  {
    rank: "intermediate",
    stage: 1,
    label: "Intermediate 1",
    min: 600,
    max: 1000,
  },
  {
    rank: "intermediate",
    stage: 2,
    label: "Intermediate 2",
    min: 1000,
    max: 1500,
  },
  // Aggressive scaling begins here
  {
    rank: "intermediate",
    stage: 3,
    label: "Intermediate 3",
    min: 1500,
    max: 2500,
  },
  { rank: "advanced", stage: 1, label: "Advanced 1", min: 2500, max: 4000 },
  { rank: "advanced", stage: 2, label: "Advanced 2", min: 4000, max: 6000 },
  { rank: "advanced", stage: 3, label: "Advanced 3", min: 6000, max: 9000 },
  { rank: "master", stage: 1, label: "Master 1", min: 9000, max: 13000 },
  { rank: "master", stage: 2, label: "Master 2", min: 13000, max: 18000 },
  { rank: "master", stage: 3, label: "Master 3", min: 18000, max: null },
];

export const findStageForPoints = (points: number): StageDef => {
  // Find last stage whose min <= points and (max is null or points < max)
  const stage = STAGES.find(
    (s) => points >= s.min && (s.max == null || points < s.max),
  );
  // If points exceed final cap, return final stage
  return stage ?? STAGES[STAGES.length - 1];
};

export const getNextStage = (current: StageDef | null): StageDef | null => {
  if (!current) return STAGES[0];
  const idx = STAGES.findIndex(
    (s) => s.rank === current.rank && s.stage === current.stage,
  );
  if (idx < 0) return STAGES[0];
  return STAGES[idx + 1] ?? null;
};

export const getProgressPercent = (
  points: number,
  current: StageDef,
): number => {
  if (current.max == null) return 100;
  const span = current.max - current.min;
  const progressed = Math.max(0, points - current.min);
  return Math.max(0, Math.min(100, Math.round((progressed / span) * 100)));
};
