import { Router } from "express";
import { generateAccount } from "../controllers/payments.controllers";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/generate-account", authMiddleware, generateAccount);

export default router;