import { Router } from "express";
import express from "express";
import { verifyNombaWebhook } from "../middleware/webhookVerify.middleware";
import { handleNombaWebhook } from "../controllers/webhooks.controllers";

const router = Router();

router.post(
  "/nomba",
  express.raw({ type: "application/json" }),
  verifyNombaWebhook,
  handleNombaWebhook
);

export default router;