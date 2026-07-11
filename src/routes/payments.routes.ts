import { Router } from "express";
import {
  generateAccount,
  getPaymentsSummary,
  getBanks,
  resolveAccountName,
  resolveInternalAccount,
  createFundingIntent,
  getReconciliationReport,
  approveMilestone,
  withdrawFunds,
  sendMoney,
  sendToBuildSporaUser,
  getPinStatus,
  setPin,
  resetPin,
  downloadReceipt,
} from "../controllers/payments.controllers";
import { authMiddleware } from "../middleware/auth.middleware";
import { pinRateLimiter } from "../middleware/ratelimiter.middleware";

const router = Router();

router.get("/banks", getBanks); // public — no auth needed
router.get("/", authMiddleware, getPaymentsSummary);

router.get("/pin-status", authMiddleware, getPinStatus);
router.post("/set-pin", authMiddleware, pinRateLimiter, setPin);
router.post("/reset-pin", authMiddleware, pinRateLimiter, resetPin);

router.post("/generate-account", authMiddleware, generateAccount);
router.post("/virtual-account", authMiddleware, generateAccount); // alias for frontend compat

router.post("/resolve-account", authMiddleware, resolveAccountName);
router.post("/resolve-internal-account", authMiddleware, resolveInternalAccount);

router.post("/fund-milestone", authMiddleware, createFundingIntent);
router.get("/reconciliation/:projectId", authMiddleware, getReconciliationReport);

router.post("/approve-milestone/:milestoneId", authMiddleware, pinRateLimiter, approveMilestone);
router.post("/withdraw", authMiddleware, pinRateLimiter, withdrawFunds);
router.post("/send-money", authMiddleware, pinRateLimiter, sendMoney);
router.post("/send-internal", authMiddleware, pinRateLimiter, sendToBuildSporaUser);

router.get("/receipt/:transactionId", authMiddleware, downloadReceipt);

export default router;