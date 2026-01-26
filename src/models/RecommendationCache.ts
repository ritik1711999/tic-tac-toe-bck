import mongoose, { Document, Schema } from "mongoose";

export interface IRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  icon: "trending-up" | "target" | "lightbulb" | "shield";
  category: "difficulty" | "strategy" | "opening" | "defense" | "endgame";
  action: {
    type: "play-game" | "view-analysis";
    label: string;
    difficulty?: string;
  };
}

export interface IRecommendationCache extends Document {
  userId: mongoose.Types.ObjectId;
  recommendations: IRecommendation[];
  status: "processing" | "completed" | "failed";
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const recommendationCacheSchema = new Schema<IRecommendationCache>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recommendations: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
          description: { type: String, required: true },
          priority: {
            type: String,
            enum: ["high", "medium", "low"],
            required: true,
          },
          icon: {
            type: String,
            enum: ["trending-up", "target", "lightbulb", "shield"],
            required: true,
          },
          category: {
            type: String,
            enum: ["difficulty", "strategy", "opening", "defense", "endgame"],
            required: true,
          },
          action: {
            type: {
              type: String,
              enum: ["play-game", "view-analysis"],
              required: true,
            },
            label: { type: String, required: true },
            difficulty: { type: String },
          },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
      index: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true, // TTL index for auto-cleanup
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique index to ensure one cache entry per user
recommendationCacheSchema.index({ userId: 1 }, { unique: true });

// TTL index for automatic cleanup
recommendationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRecommendationCache>(
  "RecommendationCache",
  recommendationCacheSchema,
);
