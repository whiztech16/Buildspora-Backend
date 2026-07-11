import { Router } from "express";
import { getMe, completeProfile, uploadAvatar } from "../controllers/user.controllers";
import { authMiddleware } from "../middleware/auth.middleware";
import { upload } from "../middleware/upload.middleware";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.patch("/profile", authMiddleware, completeProfile);
router.post("/avatar", authMiddleware, upload.single("avatar"), uploadAvatar);

export default router;