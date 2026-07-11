import { logError } from '../lib/logger';
import { Response, Request } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { users, virtualAccounts, milestones, transactions, projects, savedBankAccounts, notifications } from "../db/schema";
import { createVirtualAccount, transferToBank, resolveAccount } from "../services/nomba.service";
import {
  setTransactionPin,
  hasTransactionPin,
  verifyTransactionPin,
  resetTransactionPin,
} from "../services/pin.service";
import { BANK_LIST, isValidBankCode, getBankByCode } from "../config/banks";
import { generateReceiptPdf } from "../services/receipt.service";

interface AuthRequest extends Request {
  user?: {
    dbUserId: string;
    email: string;
    role: string;
  };
}

// ─── Get Bank List ────────────────────────────────────────────
export const getBanks = async (_req: Request, res: Response) => {
  res.json({ success: true, banks: BANK_LIST });
};

// ─── Resolve Account Name (external banks) ─────────────────────
export const resolveAccountName = async (req: AuthRequest, res: Response) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({ success: false, error: "Valid 10-digit account number is required." });
    }
    if (!bankCode) {
      return res.status(400).json({ success: false, error: "Bank code is required." });
    }
    if (!isValidBankCode(bankCode)) {
      return res.status(400).json({ success: false, error: `Unsupported bank code: ${bankCode}.` });
    }
    const result = await resolveAccount({ accountNumber, bankCode });
    const bank = getBankByCode(bankCode);
    res.json({
      success: true,
      accountName: result.accountName,
      accountNumber: result.accountNumber,
      bankName: bank?.name ?? bankCode,
    });
  } catch (error: any) {
    res.status(422).json({ success: false, error: error.message || "Could not resolve account name." });
  }
};

// ─── Resolve Internal BuildSpora Account (no Nomba call) ───────
export const resolveInternalAccount = async (req: AuthRequest, res: Response) => {
  try {
    const { accountNumber } = req.body;

    if (!accountNumber || typeof accountNumber !== "string") {
      return res.status(400).json({ success: false, error: "Account number is required." });
    }

    const va = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.accountNumber, accountNumber),
    });

    if (!va) {
      return res.status(404).json({ success: false, error: "No BuildSpora account found with that account number." });
    }

    res.json({
      success: true,
      accountName: va.accountName,
      accountNumber: va.accountNumber,
      bankName: "BuildSpora",
    });
  } catch (error: any) {
    logError("resolveInternalAccount", error);
    res.status(500).json({ success: false, error: "Could not resolve account." });
  }
};

// ─── Get Payments Summary ─────────────────────────────────────
export const getPaymentsSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;

    const va = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, userId),
    });

    const txns = await db.query.transactions.findMany({
      where: eq(transactions.userId, userId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    const totalEarnings = txns
      .filter(t =>
        t.status === "success" &&
        (t.type === "milestone_payout" || t.type === "inbound" || t.type === "marketplace_payment")
      )
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const earnings = txns.map(t => ({
      id: t.id,
      source:
        t.type === "milestone_payout" ? "Milestone" :
        t.type === "marketplace_payment" ? "Marketplace" :
        t.type === "inbound" ? "Inbound" :
        t.type === "bank_transfer" ? "Bank Transfer" :
        t.type === "withdrawal" ? "Withdrawal" : "Transfer",
      projectName: t.narration || "—",
      amount: Number(t.amount),
      date: t.createdAt,
      status: t.status === "success" ? "paid" : t.status,
      type: t.type,
      narration: t.narration,
      recipientBank: t.recipientBank,
      recipientAcct: t.recipientAcct,
      recipientName: t.recipientName,
    }));

    res.json({
      success: true,
      virtualAccount: va ? {
        accountNumber: va.accountNumber,
        accountName: va.accountName,
        bankName: va.bankName,
        balance: Number(va.balance),
      } : null,
      earnings,
      totalEarnings,
    });
  } catch (error: any) {
    logError("getPaymentsSummary", error);
    res.status(500).json({ success: false, error: "Failed to load payments." });
  }
};

// ─── Download Transaction Receipt ──────────────────────────────
export const downloadReceipt = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;
    const transactionId = req.params.transactionId as string;

    const txn = await db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
    });

    if (!txn) {
      return res.status(404).json({ success: false, error: "Transaction not found." });
    }

    if (txn.userId !== userId) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

    generateReceiptPdf(
      {
        transactionId: txn.id,
        merchantTxRef: txn.merchantTxRef ?? txn.id,
        type: txn.type,
        amount: Number(txn.amount),
        status: txn.status,
        narration: txn.narration,
        createdAt: txn.createdAt,
        recipientName: txn.recipientName,
        recipientBank: txn.recipientBank,
        recipientAcct: txn.recipientAcct,
        senderName: user?.fullName ?? "BuildSpora User",
      },
      res
    );
  } catch (error: any) {
    logError("downloadReceipt", error);
    res.status(500).json({ success: false, error: "Failed to generate receipt." });
  }
};

// ─── Generate Virtual Account ─────────────────────────────────
export const generateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;

    // Always check our DB first — single source of truth
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
          balance: Number(existing.balance),
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

    // BUG-1 FIX: Use a deterministic accountRef (no Date.now()) so that if the
    // Nomba call succeeds but our DB insert fails, a retry will find the same
    // Nomba VA instead of creating a second one.
    const deterministicRef = `bsp-${userId}`;

    const nombaVA = await createVirtualAccount({
      accountRef: deterministicRef,
      accountName,
    });

    // After getting the Nomba VA, re-check DB in case a concurrent request
    // already inserted a row while we were awaiting Nomba.
    const raceCheck = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, userId),
    });
    if (raceCheck) {
      return res.json({
        success: true,
        virtualAccount: {
          accountNumber: raceCheck.accountNumber,
          accountName: raceCheck.accountName,
          bankName: raceCheck.bankName,
          balance: Number(raceCheck.balance),
        },
        alreadyExists: true,
      });
    }

    const [va] = await db.insert(virtualAccounts).values({
      userId,
      nombaAccountId: nombaVA.accountRef ?? deterministicRef,
      accountNumber: nombaVA.bankAccountNumber,
      accountName: nombaVA.bankAccountName ?? accountName,
      bankName: nombaVA.bankName,
      balance: "0.00",
      type: user.role === "client" ? "client_project" :
            user.role === "supplier" ? "supplier_payout" : "contractor_payout",
    }).returning();

    const pinAlreadySet = await hasTransactionPin(userId);

    res.json({
      success: true,
      virtualAccount: {
        accountNumber: va.accountNumber,
        accountName: va.accountName,
        bankName: va.bankName,
        balance: Number(va.balance),
      },
      requiresPinSetup: !pinAlreadySet,
    });
  } catch (error: any) {
    // Unique-constraint violation means a concurrent request already inserted
    if (error.code === "23505") {
      const existing = await db.query.virtualAccounts.findFirst({
        where: eq(virtualAccounts.userId, req.user!.dbUserId),
      });
      return res.json({
        success: true,
        virtualAccount: existing ? {
          accountNumber: existing.accountNumber,
          accountName: existing.accountName,
          bankName: existing.bankName,
          balance: Number(existing.balance),
        } : null,
        alreadyExists: true,
      });
    }
    logError("generateAccount", error);
    res.status(500).json({ success: false, error: "Failed to generate account. Please try again." });
  }
};

// ─── Create Funding Intent ────────────────────────────────────
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
    logError("createFundingIntent", error);
    res.status(500).json({ success: false, error: "Failed to create funding intent." });
  }
};

// ─── Reconciliation Report ────────────────────────────────────
export const getReconciliationReport = async (req: AuthRequest, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const userId = req.user!.dbUserId;
    const role = req.user!.role;

    if (!projectId) {
      return res.status(400).json({ success: false, error: "Invalid project id." });
    }

    // SEC FIX: Verify the requester is the client or contractor on this project
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found." });
    }
    const hasAccess =
      (role === "client" && project.clientId === userId) ||
      (role === "contractor" && project.contractorId === userId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: "Access denied." });
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
    logError("getReconciliationReport", error);
    res.status(500).json({ success: false, error: "Failed to fetch reconciliation report." });
  }
};

// ─── PIN: Status Check ─────────────────────────────────────────
export const getPinStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;
    const exists = await hasTransactionPin(userId);
    res.json({ success: true, hasPin: exists });
  } catch (error: any) {
    logError("getPinStatus", error);
    res.status(500).json({ success: false, error: "Failed to check PIN status." });
  }
};

// ─── PIN: Set (first time) ─────────────────────────────────────
export const setPin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;
    const { pin, confirmPin } = req.body;

    if (!pin || !confirmPin) {
      return res.status(400).json({ success: false, error: "PIN and confirmation are required." });
    }

    const result = await setTransactionPin(userId, pin, confirmPin);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, message: "Transaction PIN set successfully." });
  } catch (error: any) {
    logError("setPin", error);
    res.status(500).json({ success: false, error: "Failed to set PIN." });
  }
};

// ─── PIN: Reset (forgot PIN — requires current password) ──────
export const resetPin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;
    const userEmail = req.user!.email;
    const { password, newPin, confirmNewPin } = req.body;

    if (!password || !newPin || !confirmNewPin) {
      return res.status(400).json({ success: false, error: "Password, new PIN, and confirmation are required." });
    }

    const result = await resetTransactionPin(userId, userEmail, password, newPin, confirmNewPin);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, message: "PIN reset successfully." });
  } catch (error: any) {
    logError("resetPin", error);
    res.status(500).json({ success: false, error: "Failed to reset PIN." });
  }
};

// ─── Approve Milestone ────────────────────────────────────────
export const approveMilestone = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = req.user!.dbUserId;
    const milestoneId = req.params.milestoneId as string;
    const { pin } = req.body;

    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ success: false, error: "Transaction PIN is required." });
    }

    const hasPinSet = await hasTransactionPin(clientId);
    if (!hasPinSet) {
      return res.status(403).json({ success: false, error: "PIN_REQUIRED", message: "You must set a transaction PIN before making payments." });
    }

    const pinResult = await verifyTransactionPin(clientId, pin);
    if (!pinResult.valid) {
      return res.status(401).json({ success: false, error: pinResult.error || "Invalid PIN." });
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

    const contractorVA = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, project.contractorId),
    });
    if (!contractorVA) {
      return res.status(400).json({ success: false, error: "Contractor has not generated a virtual account yet." });
    }

    const amount = Number(milestone.allocatedAmount);
    const merchantTxRef = `MILESTONE-${milestoneId}-${Date.now()}`;

    // BUG-2 FIX: Atomic balance debit — only succeeds if balance is sufficient.
    // Uses SQL-level check to prevent race conditions / double-spend.
    const [debitResult] = await db
      .update(virtualAccounts)
      .set({ balance: sql`${virtualAccounts.balance} - ${amount}`, updatedAt: new Date() })
      .where(
        and(
          eq(virtualAccounts.id, clientVA.id),
          sql`${virtualAccounts.balance} >= ${amount}`
        )
      )
      .returning({ newBalance: virtualAccounts.balance });

    if (!debitResult) {
      // Row wasn't updated — balance was insufficient at the DB level
      const fresh = await db.query.virtualAccounts.findFirst({
        where: eq(virtualAccounts.id, clientVA.id),
      });
      const currentBalance = Number(fresh?.balance ?? 0);
      const shortfall = amount - currentBalance;
      return res.status(402).json({
        success: false,
        error: "insufficient_balance",
        balance: currentBalance,
        required: amount,
        shortfall,
        accountNumber: clientVA.accountNumber,
        bankName: clientVA.bankName,
      });
    }

    await db.update(virtualAccounts)
      .set({ balance: sql`${virtualAccounts.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(virtualAccounts.id, contractorVA.id));

    await db.update(milestones)
      .set({ status: "approved", approvedAt: new Date(), nombaPaymentRef: merchantTxRef })
      .where(eq(milestones.id, milestoneId));

    await db.insert(transactions).values({
      fromAccountId: clientVA.id,
      toAccountId: contractorVA.id,
      userId: clientId,
      type: "milestone_payout",
      amount: String(amount),
      status: "success",
      milestoneId,
      merchantTxRef,
      narration: `BuildSpora: ${milestone.name} payment`,
    });

    // Create an inbound transaction record for the contractor so it shows in their history
    await db.insert(transactions).values({
      fromAccountId: clientVA.id,
      toAccountId: contractorVA.id,
      userId: project.contractorId,
      type: "milestone_payout",
      amount: String(amount),
      status: "success",
      milestoneId,
      merchantTxRef: `${merchantTxRef}-IN`,
      narration: `Received: ${milestone.name} payment`,
    });

    await db.insert(notifications).values({
      userId: project.contractorId,
      type: "milestone_approved",
      title: "Milestone Approved!",
      body: `${milestone.name} approved — ₦${amount.toLocaleString()} added to your BuildSpora balance`,
    });

    const allMilestones = await db.query.milestones.findMany({
      where: eq(milestones.projectId, project.id),
    });
    const allApproved = allMilestones.every(m => m.id === milestoneId || m.status === "approved");
    if (allApproved) {
      await db.update(projects)
        .set({ status: "completed" })
        .where(eq(projects.id, project.id));
    }

    res.json({ success: true, message: "Milestone approved. Contractor's balance has been credited." });
  } catch (error: any) {
    logError("approveMilestone", error);
    res.status(500).json({ success: false, error: "Failed to approve milestone. Please try again." });
  }
};

// ─── Withdraw Funds ───────────────────────────────────────────
export const withdrawFunds = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;
    // Accept bank details from the request body (user's form) as well as amount & pin
    const { amount, pin, accountNumber, accountName, bankCode, bankName } = req.body;

    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ success: false, error: "Transaction PIN is required." });
    }

    const hasPinSet = await hasTransactionPin(userId);
    if (!hasPinSet) {
      return res.status(403).json({ success: false, error: "PIN_REQUIRED", message: "You must set a transaction PIN before making payments." });
    }

    const pinResult = await verifyTransactionPin(userId, pin);
    if (!pinResult.valid) {
      return res.status(401).json({ success: false, error: pinResult.error || "Invalid PIN." });
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ success: false, error: "Valid amount is required." });
    }

    // Minimum withdrawal amount
    const MIN_WITHDRAWAL = 10;
    if (amount < MIN_WITHDRAWAL) {
      return res.status(400).json({ success: false, error: `Minimum withdrawal amount is ₦${MIN_WITHDRAWAL}.` });
    }

    const va = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, userId),
    });
    if (!va) {
      return res.status(400).json({ success: false, error: "No virtual account found." });
    }

    // BUG-5 FIX: Use bank details from request body if supplied, fall back to saved account.
    // This lets the user withdraw to any bank account they enter in the form.
    let withdrawAccountNum = accountNumber;
    let withdrawAccountName = accountName;
    let withdrawBankCode = bankCode;
    let withdrawBankName = bankName;

    if (!withdrawAccountNum || !withdrawBankCode) {
      const bankAccount = await db.query.savedBankAccounts.findFirst({
        where: eq(savedBankAccounts.userId, userId),
      });
      if (!bankAccount) {
        return res.status(400).json({ success: false, error: "Please provide bank account details or set up a payout account." });
      }
      withdrawAccountNum = bankAccount.accountNum;
      withdrawAccountName = bankAccount.accountName;
      withdrawBankCode = bankAccount.bankCode;
      withdrawBankName = bankAccount.bankName;
    }

    if (!withdrawAccountName) {
      return res.status(400).json({ success: false, error: "Account name is required." });
    }

    const merchantTxRef = `WITHDRAW-${userId}-${Date.now()}`;

    // BUG-2 FIX: Atomic balance debit
    const [debitResult] = await db
      .update(virtualAccounts)
      .set({ balance: sql`${virtualAccounts.balance} - ${amount}`, updatedAt: new Date() })
      .where(
        and(
          eq(virtualAccounts.id, va.id),
          sql`${virtualAccounts.balance} >= ${amount}`
        )
      )
      .returning({ newBalance: virtualAccounts.balance });

    if (!debitResult) {
      return res.status(402).json({ success: false, error: "Insufficient balance." });
    }

    await db.insert(transactions).values({
      fromAccountId: va.id,
      userId,
      type: "withdrawal",
      amount: String(amount),
      status: "pending",
      merchantTxRef,
      narration: "Withdrawal to bank account",
      recipientBank: withdrawBankName || null,
      recipientAcct: withdrawAccountNum,
      recipientName: withdrawAccountName,
    });

    try {
      await transferToBank({
        amount,
        accountNumber: withdrawAccountNum,
        accountName: withdrawAccountName,
        bankCode: withdrawBankCode,
        narration: "BuildSpora withdrawal",
        merchantTxRef,
      });

      // Nomba accepted the transfer — mark it success immediately.
      // The payout_success webhook (if/when it arrives) will be a harmless no-op.
      // This prevents the "pending forever" issue on environments where the
      // webhook cannot reach the server (localhost, firewall, etc.).
      await db.update(transactions)
        .set({ status: "success", updatedAt: new Date() })
        .where(eq(transactions.merchantTxRef, merchantTxRef));
    } catch (transferError: any) {
      // Nomba rejected the transfer — refund the balance and mark failed
      await db.update(virtualAccounts)
        .set({ balance: sql`${virtualAccounts.balance} + ${amount}`, updatedAt: new Date() })
        .where(eq(virtualAccounts.id, va.id));
      await db.update(transactions)
        .set({ status: "failed" })
        .where(eq(transactions.merchantTxRef, merchantTxRef));
      logError("withdrawFunds transferToBank", transferError);
      return res.status(500).json({ success: false, error: "Withdrawal failed to initiate. Please try again." });
    }

    res.json({ success: true, message: "Withdrawal successful. Funds are on their way to your bank account.", merchantTxRef });
  } catch (error: any) {
    logError("withdrawFunds", error);
    res.status(500).json({ success: false, error: "Failed to process withdrawal. Please try again." });
  }
};

// ─── Send Money (external bank) ────────────────────────────────
export const sendMoney = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.dbUserId;
    const { amount, accountNumber, accountName, bankCode, bankName, narration, pin } = req.body;

    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ success: false, error: "Transaction PIN is required." });
    }

    const hasPinSet = await hasTransactionPin(userId);
    if (!hasPinSet) {
      return res.status(403).json({ success: false, error: "PIN_REQUIRED", message: "You must set a transaction PIN before making payments." });
    }

    const pinResult = await verifyTransactionPin(userId, pin);
    if (!pinResult.valid) {
      return res.status(401).json({ success: false, error: pinResult.error || "Invalid PIN." });
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ success: false, error: "Valid amount is required." });
    }
    if (!accountNumber || accountNumber.length !== 10) {
      return res.status(400).json({ success: false, error: "Valid 10-digit account number is required." });
    }
    if (!accountName || typeof accountName !== "string") {
      return res.status(400).json({ success: false, error: "Recipient account name is required." });
    }
    if (!bankCode) {
      return res.status(400).json({ success: false, error: "Bank code is required." });
    }

    const va = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, userId),
    });
    if (!va) {
      return res.status(400).json({ success: false, error: "No virtual account found." });
    }

    const merchantTxRef = `SEND-${userId}-${Date.now()}`;

    // Atomic balance debit — prevents race conditions / double-spend
    const [debitResult] = await db
      .update(virtualAccounts)
      .set({ balance: sql`${virtualAccounts.balance} - ${amount}`, updatedAt: new Date() })
      .where(
        and(
          eq(virtualAccounts.id, va.id),
          sql`${virtualAccounts.balance} >= ${amount}`
        )
      )
      .returning({ newBalance: virtualAccounts.balance });

    if (!debitResult) {
      return res.status(402).json({ success: false, error: "Insufficient balance." });
    }

    await db.insert(transactions).values({
      fromAccountId: va.id,
      userId,
      type: "bank_transfer",
      amount: String(amount),
      status: "pending",
      merchantTxRef,
      narration: narration || "BuildSpora transfer",
      recipientBank: bankName || null,
      recipientAcct: accountNumber,
      recipientName: accountName,
    });

    try {
      await transferToBank({
        amount,
        accountNumber,
        accountName,
        bankCode,
        narration: narration || "BuildSpora transfer",
        merchantTxRef,
      });

      // Mark success immediately — Nomba accepted the transfer.
      // Webhook confirmation (payout_success) is a harmless no-op if/when it arrives.
      await db.update(transactions)
        .set({ status: "success", updatedAt: new Date() })
        .where(eq(transactions.merchantTxRef, merchantTxRef));
    } catch (transferError: any) {
      await db.update(virtualAccounts)
        .set({ balance: sql`${virtualAccounts.balance} + ${amount}`, updatedAt: new Date() })
        .where(eq(virtualAccounts.id, va.id));
      await db.update(transactions)
        .set({ status: "failed" })
        .where(eq(transactions.merchantTxRef, merchantTxRef));
      logError("sendMoney transferToBank", transferError);
      return res.status(500).json({ success: false, error: "Transfer failed to initiate. Please try again." });
    }

    res.json({ success: true, message: "Transfer initiated successfully.", merchantTxRef });
  } catch (error: any) {
    logError("sendMoney", error);
    res.status(500).json({ success: false, error: "Failed to send money. Please try again." });
  }
};

// ─── Send to BuildSpora User (internal VA-to-VA transfer) ──────
export const sendToBuildSporaUser = async (req: AuthRequest, res: Response) => {
  try {
    const senderId = req.user!.dbUserId;
    const { recipientAccountNumber, amount, narration, pin } = req.body;

    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ success: false, error: "Transaction PIN is required." });
    }

    const hasPinSet = await hasTransactionPin(senderId);
    if (!hasPinSet) {
      return res.status(403).json({ success: false, error: "PIN_REQUIRED", message: "You must set a transaction PIN before making payments." });
    }

    const pinResult = await verifyTransactionPin(senderId, pin);
    if (!pinResult.valid) {
      return res.status(401).json({ success: false, error: pinResult.error || "Invalid PIN." });
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ success: false, error: "Valid amount is required." });
    }
    if (!recipientAccountNumber || typeof recipientAccountNumber !== "string") {
      return res.status(400).json({ success: false, error: "Recipient account number is required." });
    }

    const senderVA = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.userId, senderId),
    });
    if (!senderVA) {
      return res.status(400).json({ success: false, error: "No virtual account found." });
    }

    const recipientVA = await db.query.virtualAccounts.findFirst({
      where: eq(virtualAccounts.accountNumber, recipientAccountNumber),
    });
    if (!recipientVA) {
      return res.status(404).json({ success: false, error: "No BuildSpora account found with that account number." });
    }
    if (recipientVA.userId === senderId) {
      return res.status(400).json({ success: false, error: "You cannot send money to yourself." });
    }

    const merchantTxRef = `P2P-${senderId}-${Date.now()}`;

    // BUG-2 FIX: Atomic balance debit — prevents race conditions
    const [debitResult] = await db
      .update(virtualAccounts)
      .set({ balance: sql`${virtualAccounts.balance} - ${amount}`, updatedAt: new Date() })
      .where(
        and(
          eq(virtualAccounts.id, senderVA.id),
          sql`${virtualAccounts.balance} >= ${amount}`
        )
      )
      .returning({ newBalance: virtualAccounts.balance });

    if (!debitResult) {
      const fresh = await db.query.virtualAccounts.findFirst({
        where: eq(virtualAccounts.id, senderVA.id),
      });
      const currentBalance = Number(fresh?.balance ?? 0);
      return res.status(402).json({
        success: false,
        error: "insufficient_balance",
        balance: currentBalance,
        required: amount,
        shortfall: amount - currentBalance,
      });
    }

    await db.update(virtualAccounts)
      .set({ balance: sql`${virtualAccounts.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(virtualAccounts.id, recipientVA.id));

    // Outbound transaction for the sender
    await db.insert(transactions).values({
      fromAccountId: senderVA.id,
      toAccountId: recipientVA.id,
      userId: senderId,
      type: "bank_transfer",
      amount: String(amount),
      status: "success",
      merchantTxRef,
      narration: narration || "BuildSpora transfer",
      recipientAcct: recipientVA.accountNumber,
      recipientName: recipientVA.accountName,
      recipientBank: "BuildSpora",
    });

    // BUG-4 FIX: Create an inbound transaction for the recipient so it appears
    // in their transaction history as received funds.
    await db.insert(transactions).values({
      fromAccountId: senderVA.id,
      toAccountId: recipientVA.id,
      userId: recipientVA.userId,
      type: "inbound",
      amount: String(amount),
      status: "success",
      merchantTxRef: `${merchantTxRef}-IN`,
      narration: narration || "BuildSpora transfer received",
    });

    await db.insert(notifications).values({
      userId: recipientVA.userId,
      type: "payment_received",
      title: "Payment Received",
      body: `You received ₦${amount.toLocaleString()} on BuildSpora`,
    });

    res.json({ success: true, message: "Transfer completed instantly.", merchantTxRef });
  } catch (error: any) {
    logError("sendToBuildSporaUser", error);
    res.status(500).json({ success: false, error: "Failed to send money. Please try again." });
  }
};