import { Response, Request } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, virtualAccounts, milestones, transactions, projects, savedBankAccounts, notifications } from "../db/schema";
import { createVirtualAccount, transferToBank } from "../services/nomba.service";

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
      accountRef: `${userId}-${Date.now()}`,
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
    const projectId = req.params.projectId as string;

    if (!projectId) {
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

export const approveMilestone = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = req.user!.dbUserId;
    const milestoneId = req.params.milestoneId as string;

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

    if (!project.contractorId) {
      return res.status(400).json({ success: false, error: "No contractor assigned." });
    }

    if (milestone.status !== "submitted") {
      return res.status(400).json({ success: false, error: "Milestone must be submitted before approval." });
    }

    if (milestone.nombaPaymentRef) {
      const existingTxn = await db.query.transactions.findFirst({
        where: eq(transactions.merchantTxRef, milestone.nombaPaymentRef),
      });
      if (existingTxn && existingTxn.status !== "failed") {
        return res.status(409).json({ success: false, error: "Payment already initiated for this milestone." });
      }
    }

    const clientVA = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, clientId),
    });

    if (!clientVA) {
      return res.status(400).json({ success: false, error: "No virtual account found." });
    }

    const balance = Number(clientVA.balance);
    const amount = Number(milestone.allocatedAmount);

    if (balance < amount) {
      const shortfall = amount - balance;
      return res.status(402).json({
        success: false,
        error: "insufficient_balance",
        balance,
        required: amount,
        shortfall,
        accountNumber: clientVA.accountNumber,
        bankName: clientVA.bankName,
      });
    }

    const contractorBank = await db.query.savedBankAccounts.findFirst({
      where: eq(savedBankAccounts.userId, project.contractorId),
    });

    if (!contractorBank) {
      return res.status(400).json({ success: false, error: "Contractor has no payout bank account set up yet." });
    }

    const merchantTxRef = `MILESTONE-${milestoneId}-${Date.now()}`;

    await db.update(virtualAccounts)
      .set({ balance: String(balance - amount), updatedAt: new Date() })
      .where(eq(virtualAccounts.id, clientVA.id));

    await db.update(milestones)
      .set({ status: "approved", approvedAt: new Date(), nombaPaymentRef: merchantTxRef })
      .where(eq(milestones.id, milestoneId));

    await db.insert(transactions).values({
      fromAccountId: clientVA.id,
      userId: clientId,
      type: "milestone_payout",
      amount: String(amount),
      status: "pending",
      milestoneId,
      merchantTxRef,
      narration: `BuildSpora: ${milestone.name} payment`,
      recipientBank: contractorBank.bankName,
      recipientAcct: contractorBank.accountNum,
      recipientName: contractorBank.accountName,
    });

    try {
      await transferToBank({
        amount,
        accountNumber: contractorBank.accountNum,
        accountName: contractorBank.accountName,
        bankCode: contractorBank.bankCode,
        narration: `BuildSpora milestone: ${milestone.name}`,
        merchantTxRef,
      });
    } catch (transferError: any) {
      await db.update(virtualAccounts)
        .set({ balance: String(balance), updatedAt: new Date() })
        .where(eq(virtualAccounts.id, clientVA.id));

      await db.update(milestones)
        .set({ status: "submitted", nombaPaymentRef: null })
        .where(eq(milestones.id, milestoneId));

      await db.update(transactions)
        .set({ status: "failed" })
        .where(eq(transactions.merchantTxRef, merchantTxRef));

      return res.status(500).json({ success: false, error: "Payment failed to initiate. Please try again." });
    }

    await db.insert(notifications).values({
      userId: project.contractorId,
      type: "milestone_approved",
      title: "Milestone Approved!",
      body: `${milestone.name} approved — ₦${amount.toLocaleString()} is on its way`,
    });

    res.json({ success: true, message: "Milestone approved. Payment is being processed.", merchantTxRef });
  } catch (error: any) {
    console.error("approveMilestone error:", error.message);
    res.status(500).json({ success: false, error: "Failed to approve milestone. Please try again." });
  }
};