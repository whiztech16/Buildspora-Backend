import { Request, Response } from "express";
import { db } from "../db";
import { users, contractorProfiles, supplierProfiles, clientProfiles } from "../db/schema";
import { getSupabaseAdmin } from "../services/supabase.service";
import { encrypt } from "../lib/encryption";
import { eq } from "drizzle-orm";
import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────
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

// ─── Safe error helper ────────────────────────────────
const NETWORK_SIGNALS = ["fetch failed", "enotfound", "econnrefused", "etimedout", "network"];

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (NETWORK_SIGNALS.some((s) => msg.includes(s))) {
      return "Network error. Please check your internet connection and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

// ─── Sign Up ──────────────────────────────────────────
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

    res.status(201).json({ success: true, message: "Account created successfully." });
  } catch (error) {
    console.error("signUp error:", error);

    if (supabaseUserId) {
      await supabaseAdmin.auth.admin.deleteUser(supabaseUserId).catch((e) => {
        console.error("Failed to rollback Supabase user:", e);
      });
    }

    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
};

// ─── Sign In ──────────────────────────────────────────
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
      },
    });
  } catch (error) {
    console.error("signIn error:", error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
};