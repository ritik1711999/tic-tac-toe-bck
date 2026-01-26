import mongoose, { Document, Schema } from "mongoose";

export interface IGameAnalysis extends Document {
  gameId: mongoose.Types.ObjectId;
  analysis: any; // Full analysis JSON from Gemini
  generatedAt: Date;
  status: "processing" | "completed" | "failed";
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const gameAnalysisSchema = new Schema<IGameAnalysis>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: "Game",
      required: true,
      index: true,
      unique: true, // One analysis per game
    },
    analysis: {
      type: Schema.Types.Mixed,
      default: null,
    },
    generatedAt: {
      type: Date,
      default: () => new Date(),
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
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IGameAnalysis>(
  "GameAnalysis",
  gameAnalysisSchema,
);
