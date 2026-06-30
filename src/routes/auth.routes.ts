import { Router } from "express";
import { signUp, signIn, forgotPassword, resetPassword } from "../controllers/auth.controllers";
import { authRateLimiter, otpRateLimiter } from "../middleware/ratelimiter.middleware";

const router = Router();

router.post("/signup", authRateLimiter, signUp);
router.post("/signin", authRateLimiter, signIn);
router.post("/forgot-password", otpRateLimiter, forgotPassword);
router.post("/reset-password", authRateLimiter, resetPassword);

export default router;