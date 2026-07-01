import { Router } from "express";
import { getMe, completeProfile } from "../controllers/user.controllers";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.patch("/profile", authMiddleware, completeProfile);

export default router;