import { Response, Request } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { notifications } from "../db/schema";

interface AuthRequest extends Request {
  user?: {
    dbUserId: string;
    email: string;
    role: string;
  };
}

// ─── Get My Notifications ─────────────────────────────────────
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;

    const userNotifications = await db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: (n, { desc }) => [desc(n.createdAt)],
      limit: 50,
    });

    const unreadCount = userNotifications.filter(n => !n.isRead).length;

    res.json({
      success: true,
      notifications: userNotifications,
      unreadCount,
    });
  } catch (error: any) {
    logError("getNotifications", error);
    res.status(500).json({ success: false, error: "Failed to load notifications." });
  }
};

// ─── Mark One as Read ──────────────────────────────────────────
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;
    const notificationId = req.params.id as string;

    const notif = await db.query.notifications.findFirst({
      where: eq(notifications.id, notificationId),
    });

    if (!notif) {
      return res.status(404).json({ success: false, error: "Notification not found." });
    }
    if (notif.userId !== userId) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));

    res.json({ success: true, message: "Marked as read." });
  } catch (error: any) {
    logError("markAsRead", error);
    res.status(500).json({ success: false, error: "Failed to update notification." });
  }
};

// ─── Mark All as Read ──────────────────────────────────────────
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;

    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    res.json({ success: true, message: "All notifications marked as read." });
  } catch (error: any) {
    logError("markAllAsRead", error);
    res.status(500).json({ success: false, error: "Failed to update notifications." });
  }
};