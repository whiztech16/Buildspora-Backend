import { Request, Response } from "express";
import { db } from "../db";
import { users, contractorProfiles, supplierProfiles, clientProfiles, projectInvites, projects, notifications } from "../db/schema";
import { getSupabaseAdmin } from "../services/supabase.service";
import { encrypt } from "../lib/encryption";
import { logError } from "../lib/logger";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1),
  role: z.enum(["client", "contractor", "supplier"]),
  phone: z.string().optional(),
  country: z.string().optional(),
  specialty: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  nin: z.string().optional(),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(6, "Invalid code.").max(6, "Invalid code."),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const NETWORK_SIGNALS = ["fetch failed", "enotfound", "econnrefused", "etimedout", "network", "connect_timeout", "und_err", "connecttimeout"];

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (NETWORK_SIGNALS.some((s) => msg.includes(s))) {
      return "Network error. Please check your internet connection and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export const signUp = async (req: Request, res: Response): Promise<void> => {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }

  const data = parsed.data;

  if (data.role === "contractor" && (!data.specialty || !data.state || !data.city)) {
    res.status(400).json({ success: false, error: "Specialty, state, and city are required for contractors." });
    return;
  }
  if (data.role === "supplier" && (!data.businessName || !data.businessType || !data.state || !data.city)) {
    res.status(400).json({ success: false, error: "Business name, type, state, and city are required for suppliers." });
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();
  let supabaseUserId: string | null = null;

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: data.role, full_name: data.fullName },
    });

    if (authError) {
      const networkMsg = safeErrorMessage(authError);
      if (networkMsg !== "Something went wrong. Please try again.") {
        res.status(500).json({ success: false, error: networkMsg });
        return;
      }
    }

    if (authError || !authData.user) {
      res.status(400).json({ success: false, error: "Registration failed. Please try again." });
      return;
    }

    supabaseUserId = authData.user.id;

    const encryptedNin = data.nin ? encrypt(data.nin) : null;

    await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          supabaseId: supabaseUserId!,
          email: data.email,
          fullName: data.fullName,
          phone: data.phone,
          role: data.role,
        })
        .returning();

      if (data.role === "contractor") {
        await tx.insert(contractorProfiles).values({
          userId: newUser.id,
          fullName: data.fullName,
          phone: data.phone,
          nin: encryptedNin,
          specialty: data.specialty as string,
          state: data.state as string,
          city: data.city as string,
        });
      } else if (data.role === "supplier") {
        await tx.insert(supplierProfiles).values({
          userId: newUser.id,
          fullName: data.fullName,
          phone: data.phone,
          businessName: data.businessName as string,
          businessType: data.businessType as string,
          state: data.state as string,
          city: data.city as string,
        });
      } else if (data.role === "client") {
        await tx.insert(clientProfiles).values({
          userId: newUser.id,
          fullName: data.fullName,
          phone: data.phone,
          country: data.country,
          nin: encryptedNin,
        });
      }
    });

    // Link any pending invites sent to this email before they had an account
    if (data.role === "contractor") {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.supabaseId, supabaseUserId),
      });

      if (dbUser) {
        const pendingInvites = await db.query.projectInvites.findMany({
          where: and(
            eq(projectInvites.invitedEmail, data.email),
            eq(projectInvites.status, "pending")
          ),
        });

        for (const invite of pendingInvites) {
          await db.update(projectInvites)
            .set({ contractorId: dbUser.id, updatedAt: new Date() })
            .where(eq(projectInvites.id, invite.id));

          const project = await db.query.projects.findFirst({
            where: eq(projects.id, invite.projectId),
          });

          await db.insert(notifications).values({
            userId: dbUser.id,
            type: "project_invite",
            title: "New Project Invitation",
            body: `You've been invited to work on "${project?.name || "a project"}"`,
            linkTo: `/contractor/invites/${invite.id}`,
          });
        }
      }
    }

    res.status(201).json({ success: true, message: "Account created successfully." });
  } catch (error) {
    logError("signUp", error);

    if (supabaseUserId) {
      await supabaseAdmin.auth.admin.deleteUser(supabaseUserId).catch((e) => {
        logError("signUp:rollback", e);
      });
    }

    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
};

export const signIn = async (req: Request, res: Response): Promise<void> => {
  const parsed = signInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid email or password." });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      const networkMsg = safeErrorMessage(authError);
      if (networkMsg !== "Something went wrong. Please try again.") {
        res.status(500).json({ success: false, error: networkMsg });
        return;
      }
    }

    if (authError || !authData.user || !authData.session) {
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseId, authData.user.id),
    });

    if (!dbUser) {
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }

    res.status(200).json({
      success: true,
      token: authData.session.access_token,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: dbUser.role,
        hasPin: !!dbUser.transactionPinHash,
      },
    });
  } catch (error) {
    logError("signIn", error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid email." });
    return;
  }

  const { email } = parsed.data;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error: authError } = await supabaseAdmin.auth.resetPasswordForEmail(email);

    if (authError) {
      const networkMsg = safeErrorMessage(authError);
      if (networkMsg !== "Something went wrong. Please try again.") {
        res.status(500).json({ success: false, error: networkMsg });
        return;
      }
    }

    res.status(200).json({
      success: true,
      message: "If an account exists with this email, a reset code has been sent.",
    });
  } catch (error) {
    logError("forgotPassword", error);
    res.status(200).json({
      success: true,
      message: "If an account exists with this email, a reset code has been sent.",
    });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }

  const { email, otp, newPassword } = parsed.data;

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      email,
      token: otp,
      type: "recovery",
    });

    if (verifyError) {
      const networkMsg = safeErrorMessage(verifyError);
      if (networkMsg !== "Something went wrong. Please try again.") {
        res.status(500).json({ success: false, error: networkMsg });
        return;
      }
    }

    if (verifyError || !verifyData.user) {
      res.status(400).json({ success: false, error: "Invalid or expired code." });
      return;
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      verifyData.user.id,
      { password: newPassword }
    );

    if (updateError) {
      res.status(500).json({ success: false, error: "Failed to reset password. Please try again." });
      return;
    }

    res.status(200).json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    logError("resetPassword", error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
};