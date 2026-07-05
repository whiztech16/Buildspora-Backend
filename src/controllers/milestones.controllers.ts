import { Request, Response } from "express";
import { eq, and, isNull, desc, gte } from "drizzle-orm";
import { db } from "../db";
import { milestones, milestoneImages, siteCheckIns, projects, notifications } from "../db/schema";
import { uploadImage } from "../services/cloudinary.service";

interface AuthRequest extends Request {
  user?: {
    dbUserId: string;
    email: string;
    role: string;
    fullName?: string;
  };
}

function getIdParam(req: Request): string | null {
  const id = req.params.id;
  if (!id || typeof id !== "string") return null;
  return id;
}

// ─── Get single milestone with images + check-ins ────────────
export const getMilestoneDetail = async (req: AuthRequest, res: Response) => {
  try {
    const milestoneId = getIdParam(req);
    if (!milestoneId) {
      return res.status(400).json({ success: false, error: "Invalid milestone id." });
    }

    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, milestoneId),
    });

    if (!milestone) {
      return res.status(404).json({ success: false, error: "Milestone not found." });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, milestone.projectId),
    });

    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found." });
    }

    const userId = req.user!.dbUserId;
    const role = req.user!.role;
    const hasAccess =
      (role === "client" && project.clientId === userId) ||
      (role === "contractor" && project.contractorId === userId);

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    const images = await db.query.milestoneImages.findMany({
      where: eq(milestoneImages.milestoneId, milestoneId),
      orderBy: (img, { asc }) => [asc(img.takenAt)],
    });

    const checkIns = await db.query.siteCheckIns.findMany({
      where: eq(siteCheckIns.milestoneId, milestoneId),
    });

    const imagesWithMaps = images.map((img) => ({
      ...img,
      mapsUrl: img.lat && img.lng ? `https://www.google.com/maps?q=${img.lat},${img.lng}` : null,
    }));

    const checkInsWithMaps = checkIns.map((c) => ({
      ...c,
      checkInMapsUrl: c.checkInLat && c.checkInLng ? `https://www.google.com/maps?q=${c.checkInLat},${c.checkInLng}` : null,
      checkOutMapsUrl: c.checkOutLat && c.checkOutLng ? `https://www.google.com/maps?q=${c.checkOutLat},${c.checkOutLng}` : null,
    }));

    res.json({
      success: true,
      milestone: { ...milestone, images: imagesWithMaps, checkIns: checkInsWithMaps },
    });
  } catch (error: any) {
    console.error("getMilestoneDetail error:", error.message);
    res.status(500).json({ success: false, error: "Failed to load milestone." });
  }
};

// ─── Check In ──────────────────────────────────────────────
export const checkIn = async (req: AuthRequest, res: Response) => {
  try {
    const milestoneId = getIdParam(req);
    if (!milestoneId) {
      return res.status(400).json({ success: false, error: "Invalid milestone id." });
    }

    const { lat, lng, locationName } = req.body;
    const contractorId = req.user!.dbUserId;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ success: false, error: "lat and lng are required numbers." });
    }

    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, milestoneId),
    });

    if (!milestone) {
      return res.status(404).json({ success: false, error: "Milestone not found." });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, milestone.projectId),
    });

    if (!project || project.contractorId !== contractorId) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    const now = new Date();
    const resetTime = new Date(now);
    if (resetTime.getHours() < 6) {
      resetTime.setDate(resetTime.getDate() - 1);
    }
    resetTime.setHours(6, 0, 0, 0);

    const existingToday = await db.query.siteCheckIns.findFirst({
      where: and(
        eq(siteCheckIns.milestoneId, milestoneId),
        eq(siteCheckIns.contractorId, contractorId),
        gte(siteCheckIns.checkInTime, resetTime)
      ),
      orderBy: (siteCheckIns, { desc }) => [desc(siteCheckIns.checkInTime)],
    });

    if (existingToday) {
      if (!existingToday.checkOutTime) {
        return res.json({ success: true, checkIn: existingToday, alreadyExists: true });
      } else {
        return res.status(403).json({ success: false, error: "You have already checked in for today. Next check-in is available at 6:00 AM." });
      }
    }

    const [newCheckIn] = await db.insert(siteCheckIns).values({
      milestoneId,
      contractorId,
      checkInTime: new Date(),
      checkInLat: String(lat),
      checkInLng: String(lng),
      checkInLocation: locationName || null,
    }).returning();

    await db.update(milestones)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(milestones.id, milestoneId));

    await db.insert(notifications).values({
      userId: project.clientId,
      type: "contractor_checkin",
      title: "Contractor Checked In",
      body: `${req.user!.fullName || "Contractor"} checked in at ${locationName || "site"}`,
      linkTo: `/client/projects/${project.id}/milestones/${milestoneId}`,
    });

    res.json({ success: true, checkIn: newCheckIn });
  } catch (error: any) {
    console.error("checkIn error:", error.message);
    res.status(500).json({ success: false, error: "Check-in failed. Please try again." });
  }
};

// ─── Check Out ─────────────────────────────────────────────
export const checkOut = async (req: AuthRequest, res: Response) => {
  try {
    const milestoneId = getIdParam(req);
    if (!milestoneId) {
      return res.status(400).json({ success: false, error: "Invalid milestone id." });
    }

    const { lat, lng, locationName } = req.body;
    const contractorId = req.user!.dbUserId;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ success: false, error: "lat and lng are required numbers." });
    }

    const existing = await db.query.siteCheckIns.findFirst({
      where: and(
        eq(siteCheckIns.milestoneId, milestoneId),
        eq(siteCheckIns.contractorId, contractorId),
        isNull(siteCheckIns.checkOutTime)
      ),
      orderBy: (siteCheckIns, { desc }) => [desc(siteCheckIns.checkInTime)],
    });

    if (!existing) {
      return res.status(400).json({ success: false, error: "You must check in before checking out." });
    }

    const [updated] = await db.update(siteCheckIns)
      .set({
        checkOutTime: new Date(),
        checkOutLat: String(lat),
        checkOutLng: String(lng),
        checkOutLocation: locationName || null,
        updatedAt: new Date(),
      })
      .where(eq(siteCheckIns.id, existing.id))
      .returning();

    res.json({ success: true, checkOut: updated });
  } catch (error: any) {
    console.error("checkOut error:", error.message);
    res.status(500).json({ success: false, error: "Check-out failed. Please try again." });
  }
};

// ─── Upload Milestone Photo ────────────────────────────────
export const uploadMilestonePhoto = async (req: AuthRequest, res: Response) => {
  try {
    const milestoneId = getIdParam(req);
    if (!milestoneId) {
      return res.status(400).json({ success: false, error: "Invalid milestone id." });
    }

    const uploadedBy = req.user!.dbUserId;
    const { lat, lng, locationName } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file provided." });
    }

    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, milestoneId),
    });

    if (!milestone) {
      return res.status(404).json({ success: false, error: "Milestone not found." });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, milestone.projectId),
    });

    if (!project || project.contractorId !== uploadedBy) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    const storageUrl = await uploadImage(req.file.buffer, "buildspora/milestones");

    const [photo] = await db.insert(milestoneImages).values({
      milestoneId,
      uploadedBy,
      storageUrl,
      lat: lat ? String(lat) : null,
      lng: lng ? String(lng) : null,
      locationName: locationName || null,
      takenAt: new Date(),
    }).returning();

    const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

    res.json({ success: true, photo: { ...photo, mapsUrl } });
  } catch (error: any) {
    console.error("uploadMilestonePhoto error:", error.message);
    res.status(500).json({ success: false, error: "Failed to upload photo. Please try again." });
  }
};

// ─── Submit Milestone ──────────────────────────────────────
export const submitMilestone = async (req: AuthRequest, res: Response) => {
  try {
    const milestoneId = getIdParam(req);
    if (!milestoneId) {
      return res.status(400).json({ success: false, error: "Invalid milestone id." });
    }

    const contractorId = req.user!.dbUserId;

    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, milestoneId),
    });

    if (!milestone) {
      return res.status(404).json({ success: false, error: "Milestone not found." });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, milestone.projectId),
    });

    if (!project || project.contractorId !== contractorId) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    const checkInRecord = await db.query.siteCheckIns.findFirst({
      where: and(
        eq(siteCheckIns.milestoneId, milestoneId),
        eq(siteCheckIns.contractorId, contractorId)
      ),
    });

    const images = await db.query.milestoneImages.findMany({
      where: eq(milestoneImages.milestoneId, milestoneId),
    });

    if (!checkInRecord) {
      return res.status(400).json({ success: false, error: "You must check in before submitting." });
    }
    if (images.length === 0) {
      return res.status(400).json({ success: false, error: "You must upload at least one photo before submitting." });
    }
    if (!checkInRecord.checkOutTime) {
      return res.status(400).json({ success: false, error: "You must check out before submitting." });
    }
    if (milestone.status === "submitted" || milestone.status === "approved") {
      return res.status(400).json({ success: false, error: `Milestone is already ${milestone.status}.` });
    }
    if ((milestone.resubmitCount ?? 0) >= 3) {
      return res.status(400).json({ success: false, error: "Maximum resubmission attempts (3) reached." });
    }

    await db.update(milestones)
      .set({ status: "submitted", submittedAt: new Date(), rejectionReason: null, updatedAt: new Date() })
      .where(eq(milestones.id, milestoneId));

    await db.insert(notifications).values({
      userId: project.clientId,
      type: "milestone_submitted",
      title: "Milestone Ready for Review",
      body: `${milestone.name} has been submitted. Review and approve to release payment.`,
      linkTo: `/client/projects/${project.id}/milestones/${milestoneId}`,
    });

    res.json({ success: true, message: "Milestone submitted successfully. Awaiting client review." });
  } catch (error: any) {
    console.error("submitMilestone error:", error.message);
    res.status(500).json({ success: false, error: "Failed to submit milestone. Please try again." });
  }
};

// ─── Reject Milestone ──────────────────────────────────────
export const rejectMilestone = async (req: AuthRequest, res: Response) => {
  try {
    const milestoneId = getIdParam(req);
    if (!milestoneId) {
      return res.status(400).json({ success: false, error: "Invalid milestone id." });
    }

    const { reason } = req.body;
    const clientId = req.user!.dbUserId;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ success: false, error: "Please provide a detailed rejection reason (at least 10 characters)." });
    }

    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, milestoneId),
    });

    if (!milestone) {
      return res.status(404).json({ success: false, error: "Milestone not found." });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, milestone.projectId),
    });

    if (!project || project.clientId !== clientId) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    if (milestone.status !== "submitted") {
      return res.status(400).json({ success: false, error: "Can only reject a submitted milestone." });
    }

    const newResubmitCount = (milestone.resubmitCount ?? 0) + 1;

    await db.update(milestones)
      .set({ status: "rejected", rejectionReason: reason.trim(), resubmitCount: newResubmitCount, updatedAt: new Date() })
      .where(eq(milestones.id, milestoneId));

    const attemptsLeft = 3 - newResubmitCount;

    if (project.contractorId) {
      await db.insert(notifications).values({
        userId: project.contractorId,
        type: "milestone_rejected",
        title: "Milestone Rejected",
        body: `${milestone.name} was rejected. Reason: ${reason.trim()}. ${attemptsLeft} resubmission attempt(s) remaining.`,
        linkTo: `/contractor/projects/${project.id}/milestones/${milestoneId}`,
      });
    }

    res.json({ success: true, message: "Milestone rejected. Contractor has been notified.", attemptsLeft });
  } catch (error: any) {
    console.error("rejectMilestone error:", error.message);
    res.status(500).json({ success: false, error: "Failed to reject milestone. Please try again." });
  }
};