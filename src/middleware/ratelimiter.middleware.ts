import { Ratelimit } from "@upstash/ratelimit";
import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";

// auth endpoints — signup, signin
const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:auth",
});

// otp / password reset endpoints
const otpLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "15 m"),
  prefix: "rl:otp",
});

function buildLimiterMiddleware(limiter: Ratelimit) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip ?? "unknown";
    const { success } = await limiter.limit(identifier);

    if (!success) {
      res.status(429).json({ success: false, error: "Too many attempts. Please try again later." });
      return;
    }

    next();
  };
}

export const authRateLimiter = buildLimiterMiddleware(authLimiter);
export const otpRateLimiter = buildLimiterMiddleware(otpLimiter);