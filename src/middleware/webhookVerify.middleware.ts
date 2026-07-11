import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../env";

export const verifyNombaWebhook = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers["nomba-signature"] as string;
  const timestamp = req.headers["nomba-timestamp"] as string;

  if (!signature || !timestamp) {
    return res.status(401).json({ success: false, error: "Missing signature or timestamp header" });
  }

  // SEC-3 FIX: Reject webhooks with a stale timestamp (> 5 min old) to prevent replay attacks
  // Nomba sends this as an ISO 8601 string (e.g. '2026-07-11T18:19:03Z'), not epoch ms.
  // new Date() also handles a numeric epoch string safely, so this works either way.
  const webhookTime = new Date(timestamp).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (isNaN(webhookTime) || Math.abs(now - webhookTime) > fiveMinutes) {
    console.error("Nomba webhook: timestamp too old or invalid", {
      timestamp,
      parsedTime: webhookTime,
      now,
      diffMs: Math.abs(now - webhookTime),
    });
    return res.status(401).json({ success: false, error: "Webhook timestamp expired" });
  }

  let payload: any;
  try {
    payload = JSON.parse((req.body as Buffer).toString());
  } catch {
    return res.status(400).json({ success: false, error: "Invalid JSON payload" });
  }

  const transaction = payload?.data?.transaction ?? {};
  const merchant = payload?.data?.merchant ?? {};

  let responseCode = transaction.responseCode;
  if (responseCode === "null" || responseCode === null || responseCode === undefined) {
    responseCode = "";
  }

  const hashingPayload = [
    payload.event_type,
    payload.requestId,
    merchant.userId,
    merchant.walletId,
    transaction.transactionId,
    transaction.type,
    transaction.time,
    responseCode,
    timestamp,
  ].join(":");

  const expectedSignature = crypto
    .createHmac("sha256", env.NOMBA_WEBHOOK_SECRET)
    .update(hashingPayload)
    .digest("base64");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.error("Nomba webhook signature mismatch", { expected: expectedSignature, received: signature });
    return res.status(401).json({ success: false, error: "Invalid signature" });
  }

  // Attach parsed payload so the controller doesn't have to re-parse the buffer
  (req as any).nombaPayload = payload;
  next();
};