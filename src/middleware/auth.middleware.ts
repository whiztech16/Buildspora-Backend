import { Request, Response, NextFunction } from "express";
import { verifySupabaseToken } from "../services/supabase.service";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Missing or invalid token." });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = await verifySupabaseToken(token);
    if (!supabaseUser) {
      return res.status(401).json({ success: false, error: "Session expired. Please log in again." });
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseId, supabaseUser.id),
    });

    if (!dbUser) {
      return res.status(404).json({ success: false, error: "User profile not found." });
    }

    (req as any).user = {
      dbUserId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
    };

    next();
  } catch (error) {
    logError("authMiddleware", error);
    res.status(500).json({ success: false, error: "Authentication failed. Please try again." });
  }
}