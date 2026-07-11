import { logError } from '../lib/logger';
import { Request, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { virtualAccounts, transactions, notifications, milestones } from "../db/schema";

export const handleNombaWebhook = async (req: Request, res: Response) => {
  res.status(200).json({ received: true });

  const payload = (req as any).nombaPayload;
  if (!payload) {
    console.error("Nomba webhook: no parsed payload attached");
    return;
  }

  const { event_type, data } = payload;

  try {
    switch (event_type) {
      case "payment_success": {
        const transaction = data.transaction;
        const customer = data.customer;
        const accountRef = transaction.aliasAccountReference;
        const amount = transaction.transactionAmount;
        const transactionId = transaction.transactionId;

        console.log("👉 accountRef from webhook:", accountRef);

        const senderInfo = `Received from ${customer?.senderName || "Unknown"} (${customer?.bankName || "Unknown bank"} - ${customer?.accountNumber || "N/A"})`;

        const va = await db.query.virtualAccounts.findFirst({
          where: eq(virtualAccounts.nombaAccountId, accountRef),
        });

        console.log("👉 VA found:", va ? va.id : "NOT FOUND");

        if (!va) {
          console.error("Nomba webhook: no VA found for aliasAccountReference", accountRef);
          break;
        }

        const merchantTxRef = `INBOUND-${transactionId}`;
        const existing = await db.query.transactions.findFirst({
          where: eq(transactions.merchantTxRef, merchantTxRef),
        });
        if (existing) {
          console.log("Nomba webhook: duplicate delivery ignored", merchantTxRef);
          break;
        }

        await db.update(virtualAccounts)
          .set({ balance: sql`${virtualAccounts.balance} + ${amount}`, updatedAt: new Date() })
          .where(eq(virtualAccounts.id, va.id));

        // Only match an intent that belongs to THIS virtual account to avoid cross-user reconciliation
        const intent = await db.query.transactions.findFirst({
          where: and(
            eq(transactions.userId, va.userId),
            eq(transactions.toAccountId, va.id),
            eq(transactions.reconciliationStatus, "pending")
          ),
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        });

        let reconciliationStatus: "matched" | "underpaid" | "overpaid" | null = null;

        if (intent && intent.expectedAmount) {
          const expected = Number(intent.expectedAmount);
          const actual = Number(amount);

          if (actual === expected) {
            reconciliationStatus = "matched";
          } else if (actual < expected) {
            reconciliationStatus = "underpaid";
          } else {
            reconciliationStatus = "overpaid";
          }

          await db.update(transactions)
            .set({
              amount: String(amount),
              status: "success",
              reconciliationStatus,
              nombaRef: transactionId,
              merchantTxRef,
              narration: senderInfo,
              updatedAt: new Date(),
            })
            .where(eq(transactions.id, intent.id));
        } else {
          await db.insert(transactions).values({
            toAccountId: va.id,
            userId: va.userId,
            type: "inbound",
            amount: String(amount),
            status: "success",
            nombaRef: transactionId,
            merchantTxRef,
            narration: senderInfo,
            reconciliationStatus: null,
          });
        }

        const amountFormatted = `₦${Number(amount).toLocaleString()}`;
        let notifTitle = "Funds Received";
        let notifBody = `${amountFormatted} received from ${customer?.senderName || "Unknown"}`;

        if (reconciliationStatus === "underpaid" && intent) {
          const shortfall = Number(intent.expectedAmount) - Number(amount);
          notifTitle = "Underpayment Detected";
          notifBody = `You sent ${amountFormatted}, but ₦${shortfall.toLocaleString()} more is needed to fully fund this milestone.`;
        } else if (reconciliationStatus === "overpaid" && intent) {
          const excess = Number(amount) - Number(intent.expectedAmount);
          notifTitle = "Overpayment Detected";
          notifBody = `You sent ${amountFormatted}, which is ₦${excess.toLocaleString()} more than the milestone budget. Contact support for a refund or credit.`;
        } else if (reconciliationStatus === "matched") {
          notifTitle = "Milestone Fully Funded";
          notifBody = `${amountFormatted} received from ${customer?.senderName || "Unknown"} — this milestone is now fully funded.`;
        }

        await db.insert(notifications).values({
          userId: va.userId,
          type: "payment_received",
          title: notifTitle,
          body: notifBody,
        });

        break;
      }

      case "payout_success": {
        const merchantTxRef = data.transaction?.merchantTxRef ?? data.merchantTxRef;
        await db.update(transactions)
          .set({ status: "success", updatedAt: new Date() })
          .where(eq(transactions.merchantTxRef, merchantTxRef));
        break;
      }

      case "payout_failed": {
        const merchantTxRef = data.transaction?.merchantTxRef ?? data.merchantTxRef;
        const txn = await db.query.transactions.findFirst({
          where: eq(transactions.merchantTxRef, merchantTxRef),
        });
        if (!txn) break;

        await db.update(transactions)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(transactions.merchantTxRef, merchantTxRef));

        // Refund balance on failed payout
        if (txn.fromAccountId) {
          await db.update(virtualAccounts)
            .set({ balance: sql`${virtualAccounts.balance} + ${txn.amount}`, updatedAt: new Date() })
            .where(eq(virtualAccounts.id, txn.fromAccountId));
        }

        // Revert milestone status if this was a milestone payment
        if (txn.milestoneId) {
          await db.update(milestones)
            .set({ status: "submitted", nombaPaymentRef: null })
            .where(eq(milestones.id, txn.milestoneId));
        }

        // LOGIC-1 FIX: Notify user their payout failed so they know funds were refunded
        if (txn.userId) {
          const amountFormatted = `₦${Number(txn.amount).toLocaleString()}`;
          await db.insert(notifications).values({
            userId: txn.userId,
            type: "payment_failed",
            title: "Transfer Failed",
            body: `Your transfer of ${amountFormatted} to ${txn.recipientName ?? "your bank"} failed. The amount has been refunded to your BuildSpora balance.`,
          });
        }
        break;
      }

      case "payment_failed": {
        console.warn("Nomba webhook: payment_failed", data);
        break;
      }

      default:
        console.log("Nomba webhook: unhandled event_type", event_type);
    }
  } catch (error: any) {
    logError("Nomba webhook processing", error);
  }
};