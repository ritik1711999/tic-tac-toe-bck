import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import connectDB from "./src/config/database";
import authRoutes from "./src/routes/auth";
import gameRoutes from "./src/routes/games";
import dashboardRoutes from "./src/routes/dashboard";
import progressionRoutes from "./src/routes/progression";
import achievementRoutes from "./src/routes/achievements";
import recommendationRoutes from "./src/routes/recommendations";
import { SocketService } from "./src/services/socketService";

connectDB();

const socketAllowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: socketAllowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: socketAllowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/progression", progressionRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/recommendations", recommendationRoutes);

new SocketService(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
