import { Router } from "express";
import { getNotifications, markAsRead, markAllAsRead } from "../controllers/notifications.controllers";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authMiddleware, getNotifications);
router.put("/:id/read", authMiddleware, markAsRead);
router.put("/read-all", authMiddleware, markAllAsRead);

export default router;