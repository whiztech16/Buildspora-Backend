import { Router } from "express";
import { generateAccount, createFundingIntent, getReconciliationReport } from "../controllers/payments.controllers";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/generate-account", authMiddleware, generateAccount);
router.post("/fund-milestone", authMiddleware, createFundingIntent);
router.get("/reconciliation/:projectId", authMiddleware, getReconciliationReport);

export default router;