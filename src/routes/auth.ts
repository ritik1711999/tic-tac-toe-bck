import express from "express";
import { body } from "express-validator";
import {
  register,
  login,
  getMe,
  updateProfile,
  googleAuth,
} from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.post(
  "/register",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
  ],
  register
);

router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").exists()],
  login
);

router.post("/google", [body("code").isString().notEmpty()], googleAuth);

router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);

export default router;
