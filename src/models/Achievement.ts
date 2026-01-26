import mongoose, { Document, Schema } from "mongoose";

export interface IAchievement extends Document {
  user: mongoose.Types.ObjectId;
  achievementId: string; // reference to ACHIEVEMENT_DEFINITIONS id
  type: "milestone" | "skill_level" | "streak" | "performance";
  title: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  unlocked: boolean;
  unlockedAt?: Date;
  progress: { current: number; target: number };
  createdAt: Date;
  updatedAt: Date;
}

const achievementSchema = new Schema<IAchievement>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    achievementId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["milestone", "skill_level", "streak", "performance"],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    rarity: {
      type: String,
      enum: ["common", "rare", "epic", "legendary"],
      default: "common",
    },
    unlocked: { type: Boolean, default: false, index: true },
    unlockedAt: { type: Date },
    progress: {
      current: { type: Number, default: 0 },
      target: { type: Number, default: 1 },
    },
  },
  {
    timestamps: true,
  },
);

achievementSchema.index({ user: 1, achievementId: 1 }, { unique: true });
achievementSchema.index({ user: 1, unlocked: 1 });

export default mongoose.model<IAchievement>("Achievement", achievementSchema);
