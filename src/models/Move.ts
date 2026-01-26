import mongoose, { Document, Schema } from "mongoose";

export interface IMoveAnalysis extends Document {
  gameId: mongoose.Types.ObjectId;
  moveNumber: number;
  position: number;
  isAiMove: boolean;
  player: "X" | "O";
  boardStateBeforeMove: (string | null)[];
  boardStateAfterMove: (string | null)[];
  expiresOnMove?: number | null; // The move index at which this mark expires
  expiredOnMove?: number | null; // The move index when expiration occurred
  expiredAt?: Date; // Timestamp when expiration was recorded
  expiredReason?: "aging"; // Reason for expiration (future-proof)
  analysis?: {
    moveScore?: number;
    moveQuality?: "Excellent" | "Good" | "Suboptimal" | "Mistake";
    currentMoveRemark?: string;
    alternateMove?: string;
    strategicReasonForAlternateMove?: string;
  };
  status: "pending" | "completed" | "failed";
  attempts: number;
  error?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const moveAnalysisSchema = new Schema<IMoveAnalysis>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: "Game",
      required: true,
      index: true,
    },
    moveNumber: { type: Number, required: true },
    position: { type: Number, required: true, min: 0, max: 8 },
    isAiMove: { type: Boolean, required: true },
    player: { type: String, enum: ["X", "O"], required: true },
    boardStateBeforeMove: {
      type: [{ type: String, enum: ["X", "O", null] }],
      required: true,
    },
    boardStateAfterMove: {
      type: [{ type: String, enum: ["X", "O", null] }],
      required: true,
    },
    expiresOnMove: { type: Number, default: null },
    expiredOnMove: { type: Number, default: null },
    expiredAt: { type: Date },
    expiredReason: { type: String, enum: ["aging"], default: undefined },
    analysis: {
      moveScore: Number,
      moveQuality: {
        type: String,
        enum: ["Excellent", "Good", "Suboptimal", "Mistake"],
      },
      currentMoveRemark: String,
      alternateMove: String,
      strategicReasonForAlternateMove: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    error: String,
    processedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Index for worker queries
moveAnalysisSchema.index({ status: 1, createdAt: 1 });
moveAnalysisSchema.index({ gameId: 1, moveNumber: 1 });
moveAnalysisSchema.index({ gameId: 1, expiresOnMove: 1 });
moveAnalysisSchema.index({ gameId: 1, expiredOnMove: 1 });

export default mongoose.model<IMoveAnalysis>("Move", moveAnalysisSchema);
