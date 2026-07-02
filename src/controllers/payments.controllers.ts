import { Response, Request } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, virtualAccounts, milestones, transactions } from "../db/schema";
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

// ─── Create Funding Intent ────────────────────────────────
export const createFundingIntent = async (req: AuthRequest, res: Response) => {
  try {
    const dbUserId = req.user!.dbUserId;
    const { milestoneId } = req.body;

    if (!milestoneId || typeof milestoneId !== "string") {
      return res.status(400).json({ success: false, error: "milestoneId is required." });
    }

    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.id, milestoneId),
    });

    if (!milestone) {
      return res.status(404).json({ success: false, error: "Milestone not found." });
    }

    if (!milestone.allocatedAmount || Number(milestone.allocatedAmount) <= 0) {
      return res.status(400).json({ success: false, error: "This milestone has no budget set." });
    }

    const va = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, dbUserId),
    });

    if (!va) {
      return res.status(400).json({ success: false, error: "Generate your virtual account first." });
    }

    const existingIntent = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.milestoneId, milestoneId),
        eq(transactions.reconciliationStatus, "pending")
      ),
    });

    if (existingIntent) {
      return res.json({
        success: true,
        intent: existingIntent,
        virtualAccount: {
          accountNumber: va.accountNumber,
          bankName: va.bankName,
          accountName: va.accountName,
        },
        alreadyExists: true,
      });
    }

    const [intent] = await db.insert(transactions).values({
      toAccountId: va.id,
      userId: dbUserId,
      type: "inbound",
      amount: "0.00",
      status: "pending",
      milestoneId,
      expectedAmount: milestone.allocatedAmount,
      reconciliationStatus: "pending",
      merchantTxRef: `INTENT-${milestoneId}-${Date.now()}`,
    }).returning();

    res.json({
      success: true,
      intent,
      virtualAccount: {
        accountNumber: va.accountNumber,
        bankName: va.bankName,
        accountName: va.accountName,
      },
    });
  } catch (error: any) {
    console.error("createFundingIntent error:", error.message);
    res.status(500).json({ success: false, error: "Failed to create funding intent." });
  }
};

// ─── Reconciliation Report ─────────────────────────────────
export const getReconciliationReport = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = req.params.projectId;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ success: false, error: "Invalid project id." });
    }

    const projectMilestones = await db.query.milestones.findMany({
      where: eq(milestones.projectId, projectId),
      orderBy: (m, { asc }) => [asc(m.orderIndex)],
    });

    const milestoneIds = projectMilestones.map(m => m.id);

    const relevantTransactions = await db.query.transactions.findMany({
      where: (t, { inArray }) => inArray(t.milestoneId, milestoneIds),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    const report = projectMilestones.map(milestone => {
      const txns = relevantTransactions.filter(t => t.milestoneId === milestone.id);
      return {
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        allocatedAmount: milestone.allocatedAmount,
        transactions: txns.map(t => ({
          amount: t.amount,
          expectedAmount: t.expectedAmount,
          reconciliationStatus: t.reconciliationStatus,
          status: t.status,
          createdAt: t.createdAt,
        })),
      };
    });

    res.json({ success: true, report });
  } catch (error: any) {
    console.error("getReconciliationReport error:", error.message);
    res.status(500).json({ success: false, error: "Failed to fetch reconciliation report." });
  }
};