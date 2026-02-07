import mongoose, { Document, Schema } from "mongoose";

export interface IGame extends Document {
  user: mongoose.Types.ObjectId;
  vs: "AI" | "Human";
  difficulty?: "easy" | "medium" | "hard"; // Only relevant when vs is "AI"
  agingEnabled?: boolean; // Whether move aging is active for this game
  maxAge?: number; // Number of moves a mark survives before expiring
  status: "in-progress" | "completed" | "abandoned" | "paused";
  outcome?: "win" | "lose" | "draw"; // Only set when status is "completed"
  duration: number; // in seconds
  rating?: number;
  opponentId?: mongoose.Types.ObjectId; // If vs is "Human", reference to opponent user
  winningLine?: number[]; // Array of 3 board indices [0-8] that form the winning line
  // Timer fields (chess-clock style)
  timerEnabled: boolean; // Whether countdown timer is active for this game
  turnDuration: number; // Total time budget per player in seconds (0 = no timer)
  playerXTimeRemaining: number; // Remaining time in seconds for player X
  playerOTimeRemaining: number; // Remaining time in seconds for player O
  timerLastStartedAt: Date | null; // When the current player's clock started ticking
  timeoutLoser?: "X" | "O"; // Which player timed out (if game ended by timeout)
  createdAt: Date;
  updatedAt: Date;
}

const gameSchema = new Schema<IGame>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vs: {
      type: String,
      enum: ["AI", "Human"],
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
    },
    agingEnabled: {
      type: Boolean,
      default: true,
    },
    maxAge: {
      type: Number,
      default: 5,
    },
    status: {
      type: String,
      enum: ["in-progress", "completed", "abandoned", "paused"],
      default: "in-progress",
      index: true,
    },
    outcome: {
      type: String,
      enum: ["win", "lose", "draw"],
    },
    duration: { type: Number, required: true, default: 0 },
    rating: { type: Number },
    opponentId: { type: Schema.Types.ObjectId, ref: "User" },
    winningLine: { type: [Number], default: null },
    // Timer fields (chess-clock style)
    timerEnabled: { type: Boolean, default: false },
    turnDuration: { type: Number, default: 0 },
    playerXTimeRemaining: { type: Number, default: 0 },
    playerOTimeRemaining: { type: Number, default: 0 },
    timerLastStartedAt: { type: Date, default: null },
    timeoutLoser: { type: String, enum: ["X", "O"], default: null },
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
gameSchema.index({ user: 1, createdAt: -1 });
gameSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IGame>("Game", gameSchema);
