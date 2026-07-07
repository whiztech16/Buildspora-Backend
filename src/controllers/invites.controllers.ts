import { logError } from '../lib/logger';
import { Request, Response } from "express";
import { eq, and, or } from "drizzle-orm";
import { db } from "../db";
import { projects, projectInvites, notifications, users } from "../db/schema";
import { env } from "../env";

interface AuthRequest extends Request {
  user?: {
    dbUserId: string;
    email: string;
    role: string;
    fullName?: string;
  };
}

async function sendInviteEmail(toEmail: string, projectName: string, senderName: string): Promise<void> {
  try {
    const params = new URLSearchParams();
    params.append("apikey", env.ELASTICEMAIL_API_KEY);
    params.append("from", env.EMAIL_FROM.match(/<(.+)>/)?.[1] ?? env.EMAIL_FROM);
    params.append("fromName", "BuildSpora");
    params.append("to", toEmail);
    params.append("subject", `${senderName} invited you to a building project on BuildSpora`);
    params.append("isTransactional", "true");
    params.append("bodyHtml", `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #16A34A;">BuildSpora</h2>
        <p>Hi there,</p>
        <p><strong>${senderName}</strong> has invited you to work on <strong>"${projectName}"</strong> on BuildSpora.</p>
        <p>BuildSpora is a construction project management platform that helps clients and contractors work together with milestone-based payments.</p>
        <a href="${env.FRONTEND_URL}/signup?role=contractor"
           style="display: inline-block; background: #16A34A; color: white; padding: 12px 24px;
                  border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
          Accept Invite & Sign Up
        </a>
        <p style="color: #6B7280; font-size: 13px;">
          Already have an account? 
          <a href="${env.FRONTEND_URL}/signin" style="color: #16A34A;">Sign in here</a> 
          and check your invites.
        </p>
        <p style="color: #6B7280; font-size: 12px; margin-top: 24px;">
          If you did not expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `);

    const response = await fetch("https://api.elasticemail.com/v2/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await response.json();
    if (!data.success) {
      console.error("sendInviteEmail Elastic Email error:", data);
    }
  } catch (error) {
    logError("sendInviteEmail failed", error);
    // Non-fatal — invite is already created in DB, email failure shouldn't block the response
  }
}

// ─── Create Invite ────────────────────────────────────────────
export const createInvite = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = req.user!.dbUserId;
    const { projectId, contractorId, email } = req.body;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ success: false, error: "projectId is required." });
    }
    if (!contractorId && !email) {
      return res.status(400).json({ success: false, error: "Either contractorId or email is required." });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found." });
    }
    if (project.clientId !== clientId) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }
    if (project.contractorId) {
      return res.status(400).json({ success: false, error: "Project already has a contractor assigned." });
    }

    const client = await db.query.users.findFirst({ where: eq(users.id, clientId) });
    const senderName = client?.fullName ?? "A BuildSpora client";

    let resolvedContractorId: string | null = null;
    let resolvedEmail: string | null = null;

    if (contractorId) {
      const contractor = await db.query.users.findFirst({
        where: eq(users.id, contractorId),
      });
      if (!contractor || contractor.role !== "contractor") {
        return res.status(404).json({ success: false, error: "Contractor not found." });
      }
      resolvedContractorId = contractorId;
      resolvedEmail = contractor.email;
    } else {
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase().trim()),
      });
      if (existingUser) {
        if (existingUser.role !== "contractor") {
          return res.status(400).json({
            success: false,
            error: "This email belongs to a non-contractor account.",
          });
        }
        resolvedContractorId = existingUser.id;
      }
      resolvedEmail = email.toLowerCase().trim();
    }

    if (resolvedContractorId) {
      const existing = await db.query.projectInvites.findFirst({
        where: and(
          eq(projectInvites.projectId, projectId),
          eq(projectInvites.contractorId, resolvedContractorId),
          eq(projectInvites.status, "pending")
        ),
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: "A pending invite already exists for this contractor.",
        });
      }
    }

    const [invite] = await db.insert(projectInvites).values({
      projectId,
      contractorId: resolvedContractorId,
      invitedEmail: resolvedEmail,
      status: "pending",
    }).returning();

    if (resolvedContractorId) {
      await db.insert(notifications).values({
        userId: resolvedContractorId,
        type: "project_invite",
        title: "New Project Invitation",
        body: `${senderName} invited you to work on "${project.name}"`,
        linkTo: `/contractor/invites/${invite.id}`,
      });
    }

    if (resolvedEmail) {
      await sendInviteEmail(resolvedEmail, project.name, senderName);
    }

    res.status(201).json({ success: true, invite });
  } catch (error: any) {
    logError("createInvite", error);
    res.status(500).json({ success: false, error: "Failed to send invite. Please try again." });
  }
};

// ─── Get My Invites (contractor) ──────────────────────────────
export const getMyInvites = async (req: AuthRequest, res: Response) => {
  try {
    const contractorId = req.user!.dbUserId;
    const contractorEmail = req.user!.email;

    const invites = await db.query.projectInvites.findMany({
      where: or(
        eq(projectInvites.contractorId, contractorId),
        eq(projectInvites.invitedEmail, contractorEmail)
      ),
      orderBy: (i, { desc }) => [desc(i.createdAt)],
    });

    const invitesWithProjects = await Promise.all(
      invites.map(async (invite) => {
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, invite.projectId),
        });
        const client = project
          ? await db.query.users.findFirst({ where: eq(users.id, project.clientId) })
          : null;
        return {
          ...invite,
          project,
          clientName: client?.fullName ?? null,
        };
      })
    );

    res.json({ success: true, invites: invitesWithProjects });
  } catch (error: any) {
    logError("getMyInvites", error);
    res.status(500).json({ success: false, error: "Failed to load invites." });
  }
};

// ─── Accept Invite ────────────────────────────────────────────
export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const contractorId = req.user!.dbUserId;
    const contractorEmail = req.user!.email;
    const inviteId = req.params.id as string;

    const invite = await db.query.projectInvites.findFirst({
      where: eq(projectInvites.id, inviteId),
    });
    if (!invite) {
      return res.status(404).json({ success: false, error: "Invite not found." });
    }

    const belongsToUser =
      invite.contractorId === contractorId ||
      invite.invitedEmail === contractorEmail;
    if (!belongsToUser) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }
    if (invite.status !== "pending") {
      return res.status(400).json({ success: false, error: `Invite already ${invite.status}.` });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, invite.projectId),
    });
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found." });
    }
    if (project.contractorId) {
      return res.status(400).json({ success: false, error: "Project already has a contractor assigned." });
    }

    await db.update(projectInvites)
      .set({ status: "accepted", contractorId, updatedAt: new Date() })
      .where(eq(projectInvites.id, inviteId));

    await db.update(projects)
      .set({ contractorId, status: "active", updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    await db.update(projectInvites)
      .set({ status: "declined", updatedAt: new Date() })
      .where(and(
        eq(projectInvites.projectId, project.id),
        eq(projectInvites.status, "pending")
      ));

    await db.insert(notifications).values({
      userId: project.clientId,
      type: "invite_accepted",
      title: "Contractor Accepted!",
      body: `${req.user!.fullName || "Your contractor"} accepted the invite for "${project.name}"`,
      linkTo: `/client/projects/${project.id}`,
    });

    res.json({
      success: true,
      message: "Invite accepted. You are now assigned to this project.",
      projectId: project.id,
    });
  } catch (error: any) {
    logError("acceptInvite", error);
    res.status(500).json({ success: false, error: "Failed to accept invite. Please try again." });
  }
};

// ─── Decline Invite ───────────────────────────────────────────
export const declineInvite = async (req: AuthRequest, res: Response) => {
  try {
    const contractorId = req.user!.dbUserId;
    const contractorEmail = req.user!.email;
    const inviteId = req.params.id as string;

    const invite = await db.query.projectInvites.findFirst({
      where: eq(projectInvites.id, inviteId),
    });
    if (!invite) {
      return res.status(404).json({ success: false, error: "Invite not found." });
    }

    const belongsToUser =
      invite.contractorId === contractorId ||
      invite.invitedEmail === contractorEmail;
    if (!belongsToUser) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }
    if (invite.status !== "pending") {
      return res.status(400).json({ success: false, error: `Invite already ${invite.status}.` });
    }

    await db.update(projectInvites)
      .set({ status: "declined", updatedAt: new Date() })
      .where(eq(projectInvites.id, inviteId));

    res.json({ success: true, message: "Invite declined." });
  } catch (error: any) {
    logError("declineInvite", error);
    res.status(500).json({ success: false, error: "Failed to decline invite. Please try again." });
  }
};