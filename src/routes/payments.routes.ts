import { Router } from "express";
import { generateAccount, createFundingIntent, getReconciliationReport, approveMilestone, withdrawFunds, sendMoney, requestPaymentOtp } from "../controllers/payments.controllers";
import { authMiddleware } from "../middleware/auth.middleware";
const router = Router();

router.post("/request-otp", authMiddleware, requestPaymentOtp);
router.post("/generate-account", authMiddleware, generateAccount);
router.post("/fund-milestone", authMiddleware, createFundingIntent);
router.get("/reconciliation/:projectId", authMiddleware, getReconciliationReport);
router.post("/approve-milestone/:milestoneId", authMiddleware, approveMilestone);
router.post("/withdraw", authMiddleware, withdrawFunds);
router.post("/send-money", authMiddleware, sendMoney);

export default router;