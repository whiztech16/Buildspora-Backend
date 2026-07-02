import { Request, Response } from "express";
import { db } from "../db";
import { users, clientProfiles, contractorProfiles, supplierProfiles, savedBankAccounts } from "../db/schema";
import { encrypt } from "../lib/encryption";
import { logError } from "../lib/logger";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { uploadImage } from "../services/cloudinary.service";

//schemas
const completeProfileSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
  nin: z.string().optional(),
  // client
  country: z.string().optional(),
  // contractor
  specialty: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  yearsExp: z.number().optional(),
  workPreference: z.string().optional(),
  teamSize: z.string().optional(),
  bio: z.string().optional(),
  // supplier
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  citiesServed: z.array(z.string()).optional(),
  supplyCategories: z.array(z.string()).optional(),
  description: z.string().optional(),
  cacNumber: z.string().optional(),
  // bank account
  bankName: z.string().optional(),
  bankCode: z.string().optional(),
  accountNum: z.string().optional(),
  accountName: z.string().optional(),
});

// get user profile
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const dbUserId = (req as any).user.dbUserId;
    const role = (req as any).user.role;

    const user = await db.query.users.findFirst({
      where: eq(users.id, dbUserId),
    });

    if (!user) {
      res.status(404).json({ success: false, error: "User not found." });
      return;
    }

    let profile = null;

    if (role === "client") {
      profile = await db.query.clientProfiles.findFirst({
        where: eq(clientProfiles.userId, dbUserId),
      });
    } else if (role === "contractor") {
      profile = await db.query.contractorProfiles.findFirst({
        where: eq(contractorProfiles.userId, dbUserId),
      });
    } else if (role === "supplier") {
      profile = await db.query.supplierProfiles.findFirst({
        where: eq(supplierProfiles.userId, dbUserId),
      });
    }

    // never expose supabaseId to the client
    const { supabaseId, ...safeUser } = user;

    res.status(200).json({ success: true, user: safeUser, profile });
  } catch (error) {
    logError("getMe", error);
    res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
  }
};

// ─── Upload Avatar ────────────────────────────────────
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const dbUserId = (req as any).user.dbUserId;
    const role = (req as any).user.role;

    if (!req.file) {
      res.status(400).json({ success: false, error: "No image file provided." });
      return;
    }

    // Upload to Cloudinary under buildspora/avatars
    const avatarUrl = await uploadImage(req.file.buffer, "buildspora/avatars");

    // Save URL to correct profile table
    if (role === "client") {
      await db.update(clientProfiles)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(clientProfiles.userId, dbUserId));
    } else if (role === "contractor") {
      await db.update(contractorProfiles)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(contractorProfiles.userId, dbUserId));
    } else if (role === "supplier") {
      await db.update(supplierProfiles)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(supplierProfiles.userId, dbUserId));
    }

    res.status(200).json({ success: true, avatarUrl });
  } catch (error) {
    logError("uploadAvatar", error);
    res.status(500).json({ success: false, error: "Image upload failed. Please try again." });
  }
};

// ─── Complete Profile 
export const completeProfile = async (req: Request, res: Response): Promise<void> => {
  const parsed = completeProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }

  const data = parsed.data;
  const dbUserId = (req as any).user.dbUserId;
  const role = (req as any).user.role;

  try {
    // update base user table
    if (data.fullName || data.phone) {
      await db.update(users)
        .set({ fullName: data.fullName, phone: data.phone, updatedAt: new Date() })
        .where(eq(users.id, dbUserId));
    }

    const encryptedNin = data.nin ? encrypt(data.nin) : undefined;

    if (role === "client") {
      const existing = await db.query.clientProfiles.findFirst({
        where: eq(clientProfiles.userId, dbUserId),
      });
      if (existing) {
        await db.update(clientProfiles)
          .set({
            fullName: data.fullName,
            phone: data.phone,
            avatarUrl: data.avatarUrl,
            country: data.country,
            nin: encryptedNin,
            updatedAt: new Date(),
          })
          .where(eq(clientProfiles.userId, dbUserId));
      } else {
        await db.insert(clientProfiles).values({
          userId: dbUserId,
          fullName: data.fullName ?? "",
          phone: data.phone,
          avatarUrl: data.avatarUrl,
          country: data.country,
          nin: encryptedNin,
        });
      }
    }

    if (role === "contractor") {
      const existing = await db.query.contractorProfiles.findFirst({
        where: eq(contractorProfiles.userId, dbUserId),
      });
      if (existing) {
        await db.update(contractorProfiles)
          .set({
            fullName: data.fullName,
            phone: data.phone,
            avatarUrl: data.avatarUrl,
            nin: encryptedNin,
            specialty: data.specialty,
            state: data.state,
            city: data.city,
            yearsExp: data.yearsExp,
            workPreference: data.workPreference,
            teamSize: data.teamSize,
            bio: data.bio,
            updatedAt: new Date(),
          })
          .where(eq(contractorProfiles.userId, dbUserId));
      } else {
        await db.insert(contractorProfiles).values({
          userId: dbUserId,
          fullName: data.fullName ?? "",
          phone: data.phone,
          avatarUrl: data.avatarUrl,
          nin: encryptedNin,
          specialty: data.specialty ?? "",
          state: data.state ?? "",
          city: data.city ?? "",
          yearsExp: data.yearsExp,
          workPreference: data.workPreference,
          teamSize: data.teamSize,
          bio: data.bio,
        });
      }
    }

    if (role === "supplier") {
      const existing = await db.query.supplierProfiles.findFirst({
        where: eq(supplierProfiles.userId, dbUserId),
      });
      if (existing) {
        await db.update(supplierProfiles)
          .set({
            fullName: data.fullName,
            phone: data.phone,
            avatarUrl: data.avatarUrl,
            businessName: data.businessName,
            businessType: data.businessType,
            state: data.state,
            city: data.city,
            citiesServed: data.citiesServed,
            supplyCategories: data.supplyCategories,
            description: data.description,
            cacNumber: data.cacNumber,
            updatedAt: new Date(),
          })
          .where(eq(supplierProfiles.userId, dbUserId));
      } else {
        await db.insert(supplierProfiles).values({
          userId: dbUserId,
          fullName: data.fullName ?? "",
          phone: data.phone,
          avatarUrl: data.avatarUrl,
          businessName: data.businessName ?? "",
          businessType: data.businessType ?? "",
          state: data.state ?? "",
          city: data.city ?? "",
          citiesServed: data.citiesServed,
          supplyCategories: data.supplyCategories,
          description: data.description,
          cacNumber: data.cacNumber,
        });
      }
    }

    // save bank account for contractors and suppliers only
    if (data.bankName && data.bankCode && data.accountNum && data.accountName && role !== "client") {
      const existingBank = await db.query.savedBankAccounts.findFirst({
        where: eq(savedBankAccounts.userId, dbUserId),
      });
      if (!existingBank) {
        await db.insert(savedBankAccounts).values({
          userId: dbUserId,
          bankName: data.bankName,
          bankCode: data.bankCode,
          accountNum: data.accountNum,
          accountName: data.accountName,
        });
      }
    }

    // return updated profile
    let profile = null;
    if (role === "client") {
      profile = await db.query.clientProfiles.findFirst({ where: eq(clientProfiles.userId, dbUserId) });
    } else if (role === "contractor") {
      profile = await db.query.contractorProfiles.findFirst({ where: eq(contractorProfiles.userId, dbUserId) });
    } else if (role === "supplier") {
      profile = await db.query.supplierProfiles.findFirst({ where: eq(supplierProfiles.userId, dbUserId) });
    }

    const updatedUser = await db.query.users.findFirst({ where: eq(users.id, dbUserId) });
    const { supabaseId, ...safeUser } = updatedUser!;

    res.status(200).json({ success: true, user: safeUser, profile });
  } catch (error) {
    logError("completeProfile", error);
    res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
  }
};
