import mongoose, { Document, Schema } from "mongoose";

export interface IUserStats {
  gamesPlayed: number;
  totalWins: number;
  totalLoses: number;
  totalDraws: number;
  currentWinStreak: number;
  currentLossStreak: number;
  longestWinStreak: number;
  expertAiWins: number;
  fastestWin: number | null; // in seconds
  perfectWins: number;
}

export interface IUser extends Document {
  email: string;
  password?: string; // optional for OAuth users
  googleId?: string;
  name?: string;
  avatar?: string;
  authProvider?: "local" | "google";
  // Progression properties (config-driven)
  skillPoints: number; // total points accumulated
  currentSkill: {
    rank: "beginner" | "intermediate" | "advanced" | "master";
    stage: 1 | 2 | 3;
    label: string;
  } | null;
  currentSkillAchievedAt: Date | null;
  lastSeenLevelUpAt: Date | null; // track when user last viewed level-up modal
  nextSkill: {
    rank: "beginner" | "intermediate" | "advanced" | "master";
    stage: 1 | 2 | 3;
    label: string;
  } | null;
  pointsToNextLevel: number; // how far to upcoming level threshold
  stats: IUserStats;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String },
    avatar: { type: String },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    skillPoints: { type: Number, default: 0 },
    currentSkill: {
      rank: {
        type: String,
        enum: ["beginner", "intermediate", "advanced", "master"],
      },
      stage: { type: Number, enum: [1, 2, 3] },
      label: { type: String },
    },
    currentSkillAchievedAt: { type: Date, default: null },
    lastSeenLevelUpAt: { type: Date, default: null },
    nextSkill: {
      rank: {
        type: String,
        enum: ["beginner", "intermediate", "advanced", "master"],
      },
      stage: { type: Number, enum: [1, 2, 3] },
      label: { type: String },
    },
    pointsToNextLevel: { type: Number, default: 0 },
    stats: {
      gamesPlayed: { type: Number, default: 0 },
      totalWins: { type: Number, default: 0 },
      totalLoses: { type: Number, default: 0 },
      totalDraws: { type: Number, default: 0 },
      currentWinStreak: { type: Number, default: 0 },
      currentLossStreak: { type: Number, default: 0 },
      longestWinStreak: { type: Number, default: 0 },
      expertAiWins: { type: Number, default: 0 },
      fastestWin: { type: Number, default: null },
      perfectWins: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ email: 1 });
// Removed achievement indices due to model refactor

export default mongoose.model<IUser>("User", userSchema);
