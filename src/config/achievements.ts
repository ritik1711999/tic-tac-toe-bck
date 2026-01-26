import { IUser } from "../models/User";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide-react icon name
  target: number;
  progress: (user: IUser) => number;
  condition: (user: IUser) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "FIRST_WIN",
    title: "First Victory",
    description: "Win your first game",
    icon: "Trophy",
    target: 1,
    progress: (user) => {
      return user.stats.totalWins > 0 ? 1 : 0;
    },
    condition: (user) => {
      return user.stats.totalWins >= 1;
    },
  },
  {
    id: "WIN_STREAK_5",
    title: "On Fire",
    description: "Win 5 games in a row",
    icon: "Flame",
    target: 5,
    progress: (user) => {
      return Math.min(user.stats.currentWinStreak, 5);
    },
    condition: (user) => {
      return user.stats.currentWinStreak >= 5;
    },
  },
  {
    id: "GAMES_50",
    title: "Dedicated Player",
    description: "Complete 50 games",
    icon: "Zap",
    target: 50,
    progress: (user) => {
      return Math.min(user.stats.gamesPlayed, 50);
    },
    condition: (user) => {
      return user.stats.gamesPlayed >= 50;
    },
  },
  {
    id: "HARD_AI_10",
    title: "AI Master",
    description: "Win 10 games against hard AI",
    icon: "Cpu",
    target: 10,
    progress: (user) => {
      return Math.min(user.stats.expertAiWins, 10);
    },
    condition: (user) => {
      return user.stats.expertAiWins >= 10;
    },
  },
  {
    id: "WIN_STREAK_10",
    title: "Unstoppable",
    description: "Win 10 games in a row",
    icon: "Zap",
    target: 10,
    progress: (user) => {
      return Math.min(user.stats.currentWinStreak, 10);
    },
    condition: (user) => {
      return user.stats.currentWinStreak >= 10;
    },
  },
  {
    id: "GAMES_100",
    title: "Legend",
    description: "Complete 100 games",
    icon: "Star",
    target: 100,
    progress: (user) => {
      return Math.min(user.stats.gamesPlayed, 100);
    },
    condition: (user) => {
      return user.stats.gamesPlayed >= 100;
    },
  },
];
