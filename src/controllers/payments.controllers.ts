import { Response, Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, virtualAccounts } from "../db/schema";
import { createVirtualAccount } from "../services/nomba.service";

interface AuthRequest extends Request {
  user?: {
    dbUserId: string;
    email: string;
    role: string;
  };
}

export const generateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;

    const existing = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, userId),
    });

    if (existing) {
      return res.json({
        success: true,
        virtualAccount: {
          accountNumber: existing.accountNumber,
          accountName: existing.accountName,
          bankName: existing.bankName,
          balance: existing.balance,
        },
        alreadyExists: true,
      });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const accountName = `${user.fullName} - BuildSpora`;

    const nombaVA = await createVirtualAccount({
      accountRef: userId,
      accountName,
    });

    const [va] = await db.insert(virtualAccounts).values({
      userId,
      nombaAccountId: nombaVA.accountRef,
      accountNumber: nombaVA.bankAccountNumber,
      accountName: nombaVA.bankAccountName,
      bankName: nombaVA.bankName,
      balance: "0.00",
      type: user.role === "client" ? "client_project" : user.role === "supplier" ? "supplier_payout" : "contractor_payout",
    }).returning();

    res.json({
      success: true,
      virtualAccount: {
        accountNumber: va.accountNumber,
        accountName: va.accountName,
        bankName: va.bankName,
        balance: va.balance,
      },
    });
  } catch (error: any) {
    if (error.code === "23505") {
      const existing = await db.query.virtualAccounts.findFirst({
        where: eq(virtualAccounts.userId, req.user!.dbUserId),
      });
      return res.json({ success: true, virtualAccount: existing, alreadyExists: true });
    }

    console.error("generateAccount error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Failed to generate account. Please try again." });
  }
};