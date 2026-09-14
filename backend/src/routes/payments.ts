import { Router } from "express";
import express from "express";
import Stripe from "stripe";
import { prisma } from "../db";
import { config } from "../config";
import { requireAuth, requireRole } from "../middleware/auth";
import { emitToUser } from "../sockets/index";
import { sendPushNotification } from "../push";

function stripeClient(): Stripe {
  if (!config.stripeSecretKey) {
    throw new PaymentsNotConfiguredError();
  }
  return new Stripe(config.stripeSecretKey, { apiVersion: "2024-06-20" });
}

class PaymentsNotConfiguredError extends Error {}

function handlePaymentsNotConfigured(res: express.Response) {
  return res.status(503).json({
    error: "Payments are not configured on this server (missing STRIPE_SECRET_KEY)",
  });
}

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

// POST /payments/locksmith-onboarding-link — creates (or resumes) a Stripe Connect
// Express account for this locksmith and returns a hosted onboarding URL to open in a
// browser. Stripe collects identity + bank details directly; we never touch either.
paymentsRouter.post("/locksmith-onboarding-link", requireRole("LOCKSMITH"), async (req, res) => {
  try {
    const stripe = stripeClient();
    const profile = await prisma.locksmithProfile.findUnique({ where: { userId: req.auth!.userId } });
    if (!profile) return res.status(404).json({ error: "Locksmith profile not found" });

    let accountId = profile.stripeAccountId;
    if (!accountId) {
      const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
      const account = await stripe.accounts.create({
        type: "express",
        email: user?.email,
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      });
      accountId = account.id;
      await prisma.locksmithProfile.update({
        where: { userId: req.auth!.userId },
        data: { stripeAccountId: accountId },
      });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: config.stripeOnboardingRefreshUrl,
      return_url: config.stripeOnboardingReturnUrl,
      type: "account_onboarding",
    });

    return res.json({ url: link.url });
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) return handlePaymentsNotConfigured(res);
    console.error("Stripe onboarding link error:", err);
    return res.status(502).json({ error: "Failed to create the Stripe onboarding link" });
  }
});

// GET /payments/locksmith-onboarding-status — has this locksmith finished Connect
// onboarding (bank account verified, able to receive transfers)?
paymentsRouter.get("/locksmith-onboarding-status", requireRole("LOCKSMITH"), async (req, res) => {
  const profile = await prisma.locksmithProfile.findUnique({ where: { userId: req.auth!.userId } });
  if (!profile?.stripeAccountId) return res.json({ onboarded: false });

  try {
    const stripe = stripeClient();
    const account = await stripe.accounts.retrieve(profile.stripeAccountId);
    const onboarded = Boolean(account.charges_enabled && account.payouts_enabled);
    if (onboarded !== profile.stripeOnboarded) {
      await prisma.locksmithProfile.update({
        where: { userId: req.auth!.userId },
        data: { stripeOnboarded: onboarded },
      });
    }
    return res.json({ onboarded });
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) return handlePaymentsNotConfigured(res);
    console.error("Stripe onboarding status error:", err);
    return res.status(502).json({ error: "Failed to check Stripe onboarding status" });
  }
});

// POST /requests/:id/payment-intent — client pays for a completed job. The platform
// collects the full amount and transfers (finalPrice - platform fee) to the
// locksmith's Connect account.
export const requestPaymentsRouter = Router();
requestPaymentsRouter.use(requireAuth);

requestPaymentsRouter.post("/:id/payment-intent", requireRole("CLIENT"), async (req, res) => {
  const request = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: "Not found" });
  if (request.clientId !== req.auth!.userId) return res.status(403).json({ error: "Not your request" });
  if (request.status !== "COMPLETED") {
    return res.status(409).json({ error: "The job must be completed before it can be paid" });
  }
  if (request.paymentStatus === "PAID") {
    return res.status(409).json({ error: "This request has already been paid" });
  }
  if (!request.locksmithId || !request.finalPrice) {
    return res.status(409).json({ error: "Request is missing a locksmith or a final price" });
  }

  const profile = await prisma.locksmithProfile.findUnique({ where: { userId: request.locksmithId } });
  if (!profile?.stripeAccountId || !profile.stripeOnboarded) {
    return res.status(409).json({ error: "The locksmith hasn't finished setting up payouts yet" });
  }

  try {
    const stripe = stripeClient();
    const amount = Math.round(request.finalPrice * 100);
    const applicationFeeAmount = Math.round(amount * (config.platformFeePercent / 100));

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "eur",
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: profile.stripeAccountId },
      metadata: { requestId: request.id },
      automatic_payment_methods: { enabled: true },
    });

    await prisma.serviceRequest.update({
      where: { id: request.id },
      data: { paymentIntentId: intent.id, paymentStatus: "PENDING" },
    });

    return res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) return handlePaymentsNotConfigured(res);
    console.error("Stripe payment intent error:", err);
    return res.status(502).json({ error: "Failed to create the payment" });
  }
});

// POST /payments/webhook — Stripe calls this directly (not the mobile app) to confirm
// a payment succeeded or failed. Mounted in app.ts with express.raw() BEFORE the
// global JSON body parser, since signature verification needs the exact raw bytes.
export const stripeWebhookRouter = Router();
stripeWebhookRouter.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    return handlePaymentsNotConfigured(res);
  }

  let event: Stripe.Event;
  try {
    const stripe = stripeClient();
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"] as string,
      config.stripeWebhookSecret
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const request = await prisma.serviceRequest.findUnique({ where: { paymentIntentId: intent.id } });
    if (request) {
      const paid = event.type === "payment_intent.succeeded";
      const updated = await prisma.serviceRequest.update({
        where: { id: request.id },
        data: { paymentStatus: paid ? "PAID" : "FAILED", paidAt: paid ? new Date() : undefined },
      });
      emitToUser(updated.clientId, "request:status", { request: updated });
      if (updated.locksmithId) {
        emitToUser(updated.locksmithId, "request:status", { request: updated });
        if (paid) {
          void sendPushNotification(
            updated.locksmithId,
            "Paiement reçu",
            `Le client a payé ${updated.finalPrice} € pour cette intervention.`,
            { type: "request:status", requestId: updated.id, status: updated.status }
          );
        }
      }
    }
  }

  return res.json({ received: true });
});
