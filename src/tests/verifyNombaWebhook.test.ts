import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

// Mock env.ts BEFORE importing the middleware, so we never hit
// real Zod validation / process.exit(1) from the actual env.ts
vi.mock("../env", () => ({
  env: {
    NOMBA_WEBHOOK_SECRET: "test-secret",
  },
}));

import { verifyNombaWebhook } from "../middleware/webhookVerify.middleware";

const TEST_SECRET = "test-secret";

function buildSignedRequest(overrides: {
  timestamp?: string;
  event_type?: string;
  requestId?: string;
  merchant?: { userId?: string; walletId?: string };
  transaction?: {
    transactionId?: string;
    type?: string;
    time?: string;
    responseCode?: string | null;
  };
  badSignature?: boolean;
} = {}) {
  const timestamp = overrides.timestamp ?? new Date().toISOString();
  const payload = {
    event_type: overrides.event_type ?? "payment_success",
    requestId: overrides.requestId ?? "req_123",
    data: {
      merchant: {
        userId: overrides.merchant?.userId ?? "merchant_1",
        walletId: overrides.merchant?.walletId ?? "wallet_1",
      },
      transaction: {
        transactionId: overrides.transaction?.transactionId ?? "txn_1",
        type: overrides.transaction?.type ?? "credit",
        time: overrides.transaction?.time ?? timestamp,
        responseCode: overrides.transaction?.responseCode ?? null,
      },
    },
  };

  let responseCode = payload.data.transaction.responseCode;
  if (responseCode === "null" || responseCode === null || responseCode === undefined) {
    responseCode = "";
  }

  const hashingPayload = [
    payload.event_type,
    payload.requestId,
    payload.data.merchant.userId,
    payload.data.merchant.walletId,
    payload.data.transaction.transactionId,
    payload.data.transaction.type,
    payload.data.transaction.time,
    responseCode,
    timestamp,
  ].join(":");

  const signature = overrides.badSignature
    ? "invalid-signature"
    : crypto.createHmac("sha256", TEST_SECRET).update(hashingPayload).digest("base64");

  const body = Buffer.from(JSON.stringify(payload));

  const req = {
    headers: {
      "nomba-signature": signature,
      "nomba-timestamp": timestamp,
    },
    body,
  } as unknown as Request;

  return { req, payload };
}

function buildRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("verifyNombaWebhook", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it("calls next() for a valid signature and fresh ISO timestamp", () => {
    const { req } = buildSignedRequest();
    const res = buildRes();

    verifyNombaWebhook(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as any).nombaPayload).toBeDefined();
  });

  it("rejects when signature or timestamp headers are missing", () => {
    const { req } = buildSignedRequest();
    delete (req.headers as any)["nomba-timestamp"];
    const res = buildRes();

    verifyNombaWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an ISO timestamp older than 5 minutes", () => {
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { req } = buildSignedRequest({ timestamp: staleTimestamp });
    const res = buildRes();

    verifyNombaWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Webhook timestamp expired" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a fresh ISO timestamp (regression: Number(isoString) used to be NaN and always fail)", () => {
    const freshIso = new Date().toISOString();
    const { req } = buildSignedRequest({ timestamp: freshIso });
    const res = buildRes();

    verifyNombaWebhook(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects an invalid/garbage timestamp string", () => {
    const { req } = buildSignedRequest({ timestamp: "not-a-real-timestamp" });
    const res = buildRes();

    verifyNombaWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects when the HMAC signature doesn't match", () => {
    const { req } = buildSignedRequest({ badSignature: true });
    const res = buildRes();

    verifyNombaWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid signature" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON body", () => {
    const { req } = buildSignedRequest();
    (req as any).body = Buffer.from("{not valid json");
    const res = buildRes();

    verifyNombaWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});