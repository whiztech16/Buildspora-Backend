import { Request, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { virtualAccounts, transactions, notifications } from "../db/schema";

export const handleNombaWebhook = async (req: Request, res: Response) => {
  // Respond immediately — Nomba retries with exponential backoff on non-2XX
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
        const accountRef = transaction.aliasAccountReference;
        const amount = transaction.transactionAmount;
        const transactionId = transaction.transactionId;

        const va = await db.query.virtualAccounts.findFirst({
          where: eq(virtualAccounts.nombaAccountId, accountRef),
        });

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

        // Always credit balance — the money is real regardless of reconciliation outcome
        await db.update(virtualAccounts)
          .set({ balance: sql`${virtualAccounts.balance} + ${amount}`, updatedAt: new Date() })
          .where(eq(virtualAccounts.id, va.id));

        // Find the oldest pending funding intent for this user
        const intent = await db.query.transactions.findFirst({
          where: and(
            eq(transactions.userId, va.userId),
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
            reconciliationStatus: null,
          });
        }

        const amountFormatted = `₦${Number(amount).toLocaleString()}`;
        let notifTitle = "Funds Received";
        let notifBody = `${amountFormatted} added to your account`;

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
          notifBody = `${amountFormatted} received — this milestone is now fully funded.`;
        }

        await db.insert(notifications).values({
          userId: va.userId,
          type: "payment_received",
          title: notifTitle,
          body: notifBody,
        });

        break;
      }

      case "payout_success":
        console.log("Nomba webhook: payout_success received (transfers not yet implemented)", data);
        break;

      case "payment_failed":
        console.warn("Nomba webhook: payment_failed", data);
        break;

      default:
        console.log("Nomba webhook: unhandled event_type", event_type);
    }
  } catch (error: any) {
    console.error("Nomba webhook processing error:", error.message);
  }
};