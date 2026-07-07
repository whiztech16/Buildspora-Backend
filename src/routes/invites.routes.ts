import { Router } from "express";
import { createInvite, getMyInvites, acceptInvite, declineInvite } from "../controllers/invites.controllers";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authMiddleware, createInvite);
router.get("/", authMiddleware, getMyInvites);
router.put("/:id/accept", authMiddleware, acceptInvite);
router.put("/:id/decline", authMiddleware, declineInvite);

export default router;