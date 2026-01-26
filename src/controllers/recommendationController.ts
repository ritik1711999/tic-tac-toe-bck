import { Request, Response } from "express";
import { recommendationService } from "../services/recommendationService";

/**
 * Get personalized AI recommendations for the authenticated user
 * GET /api/recommendations
 */
export const getRecommendations = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
      return;
    }

    const recommendations = await recommendationService.generateRecommendations(
      userId.toString(),
    );

    res.status(200).json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate recommendations",
    });
  }
};
