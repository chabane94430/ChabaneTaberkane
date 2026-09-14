import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const stripeMocks = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountsRetrieve: vi.fn(),
  accountLinksCreate: vi.fn(),
  paymentIntentsCreate: vi.fn(),
  webhooksConstructEvent: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    accounts: { create: stripeMocks.accountsCreate, retrieve: stripeMocks.accountsRetrieve },
    accountLinks: { create: stripeMocks.accountLinksCreate },
    paymentIntents: { create: stripeMocks.paymentIntentsCreate },
    webhooks: { constructEvent: stripeMocks.webhooksConstructEvent },
  })),
}));

const { createApp } = await import("../src/app");
const { prisma } = await import("../src/db");
const { config } = await import("../src/config");

const app = createApp();
const stamp = Date.now();
const password = "supersecret123";

async function registerClient(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Pay Client",
    role: "CLIENT",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function registerLocksmith(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Pay Locksmith",
    role: "LOCKSMITH",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function completedRequestFor(client: { token: string; id: string }, locksmith: { token: string; id: string }) {
  await prisma.locksmithProfile.update({
    where: { userId: locksmith.id },
    data: { isOnline: true, latitude: 48.8566, longitude: 2.3522, lastLocationAt: new Date() },
  });
  const createRes = await request(app)
    .post("/requests")
    .set("Authorization", `Bearer ${client.token}`)
    .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
  const requestId = createRes.body.request.id;
  await request(app).post(`/requests/${requestId}/accept`).set("Authorization", `Bearer ${locksmith.token}`);
  await request(app)
    .patch(`/requests/${requestId}/status`)
    .set("Authorization", `Bearer ${locksmith.token}`)
    .send({ status: "ARRIVED" });
  await request(app)
    .patch(`/requests/${requestId}/status`)
    .set("Authorization", `Bearer ${locksmith.token}`)
    .send({ status: "COMPLETED", finalPrice: 100 });
  return requestId;
}

describe("payments (Stripe not configured)", () => {
  const original = { secret: config.stripeSecretKey, webhook: config.stripeWebhookSecret };
  beforeEach(() => {
    config.stripeSecretKey = undefined;
    config.stripeWebhookSecret = undefined;
  });
  afterEach(() => {
    config.stripeSecretKey = original.secret;
    config.stripeWebhookSecret = original.webhook;
  });

  it("returns 503 for onboarding link creation", async () => {
    const locksmith = await registerLocksmith(`pay-noconf-${stamp}@test.dev`);
    const res = await request(app)
      .post("/payments/locksmith-onboarding-link")
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(res.status).toBe(503);
  });

  it("returns 503 for payment intent creation", async () => {
    const client = await registerClient(`pay-noconf-client-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`pay-noconf-locksmith-${stamp}@test.dev`);
    const requestId = await completedRequestFor(client, locksmith);
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { stripeAccountId: "acct_fake", stripeOnboarded: true },
    });

    const res = await request(app)
      .post(`/requests/${requestId}/payment-intent`)
      .set("Authorization", `Bearer ${client.token}`);
    expect(res.status).toBe(503);
  });

  it("returns 503 for the webhook", async () => {
    const res = await request(app)
      .post("/payments/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "whatever")
      .send(JSON.stringify({ type: "payment_intent.succeeded" }));
    expect(res.status).toBe(503);
  });
});

describe("payments (Stripe configured, mocked SDK)", () => {
  const original = { secret: config.stripeSecretKey, webhook: config.stripeWebhookSecret };
  beforeEach(() => {
    config.stripeSecretKey = "sk_test_fake";
    config.stripeWebhookSecret = "whsec_fake";
    vi.clearAllMocks();
  });
  afterEach(() => {
    config.stripeSecretKey = original.secret;
    config.stripeWebhookSecret = original.webhook;
  });

  it("creates a Connect account and onboarding link for a first-time locksmith", async () => {
    const locksmith = await registerLocksmith(`pay-onboard-${stamp}@test.dev`);
    stripeMocks.accountsCreate.mockResolvedValue({ id: "acct_new123" });
    stripeMocks.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup/acct_new123" });

    const res = await request(app)
      .post("/payments/locksmith-onboarding-link")
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://connect.stripe.com/setup/acct_new123");
    expect(stripeMocks.accountsCreate).toHaveBeenCalledTimes(1);

    const profile = await prisma.locksmithProfile.findUnique({ where: { userId: locksmith.id } });
    expect(profile?.stripeAccountId).toBe("acct_new123");
  });

  it("reuses an existing Stripe account instead of creating a new one", async () => {
    const locksmith = await registerLocksmith(`pay-reuse-${stamp}@test.dev`);
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { stripeAccountId: "acct_existing" },
    });
    stripeMocks.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup/acct_existing" });

    const res = await request(app)
      .post("/payments/locksmith-onboarding-link")
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(res.status).toBe(200);
    expect(stripeMocks.accountsCreate).not.toHaveBeenCalled();
    expect(stripeMocks.accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_existing" })
    );
  });

  it("reports onboarding status from Stripe and persists it", async () => {
    const locksmith = await registerLocksmith(`pay-status-${stamp}@test.dev`);
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { stripeAccountId: "acct_status" },
    });
    stripeMocks.accountsRetrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: true });

    const res = await request(app)
      .get("/payments/locksmith-onboarding-status")
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(res.status).toBe(200);
    expect(res.body.onboarded).toBe(true);

    const profile = await prisma.locksmithProfile.findUnique({ where: { userId: locksmith.id } });
    expect(profile?.stripeOnboarded).toBe(true);
  });

  it("refuses a payment intent when the locksmith hasn't finished onboarding", async () => {
    const client = await registerClient(`pay-notonboarded-client-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`pay-notonboarded-locksmith-${stamp}@test.dev`);
    const requestId = await completedRequestFor(client, locksmith);

    const res = await request(app)
      .post(`/requests/${requestId}/payment-intent`)
      .set("Authorization", `Bearer ${client.token}`);
    expect(res.status).toBe(409);
    expect(stripeMocks.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("creates a payment intent with the platform fee once the locksmith is onboarded", async () => {
    const client = await registerClient(`pay-intent-client-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`pay-intent-locksmith-${stamp}@test.dev`);
    const requestId = await completedRequestFor(client, locksmith);
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { stripeAccountId: "acct_ready", stripeOnboarded: true },
    });
    stripeMocks.paymentIntentsCreate.mockResolvedValue({ id: `pi_${stamp}`, client_secret: "pi_123_secret_abc" });

    const res = await request(app)
      .post(`/requests/${requestId}/payment-intent`)
      .set("Authorization", `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_123_secret_abc");

    expect(stripeMocks.paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        currency: "eur",
        application_fee_amount: Math.round(10000 * (config.platformFeePercent / 100)),
        transfer_data: { destination: "acct_ready" },
      })
    );

    const updated = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    expect(updated?.paymentIntentId).toBe(`pi_${stamp}`);
    expect(updated?.paymentStatus).toBe("PENDING");
  });

  it("rejects a payment intent request from someone other than the client", async () => {
    const client = await registerClient(`pay-notowner-client-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`pay-notowner-locksmith-${stamp}@test.dev`);
    const requestId = await completedRequestFor(client, locksmith);
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { stripeAccountId: "acct_ready2", stripeOnboarded: true },
    });

    const res = await request(app)
      .post(`/requests/${requestId}/payment-intent`)
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(res.status).toBe(403);
  });

  it("marks the request PAID when the webhook reports payment_intent.succeeded", async () => {
    const client = await registerClient(`pay-webhook-client-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`pay-webhook-locksmith-${stamp}@test.dev`);
    const requestId = await completedRequestFor(client, locksmith);
    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { paymentIntentId: `pi_webhook_${stamp}`, paymentStatus: "PENDING" },
    });

    stripeMocks.webhooksConstructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: `pi_webhook_${stamp}` } },
    });

    const res = await request(app)
      .post("/payments/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "whatever")
      .send(JSON.stringify({ id: "evt_1" }));
    expect(res.status).toBe(200);

    const updated = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    expect(updated?.paymentStatus).toBe("PAID");
    expect(updated?.paidAt).toBeTruthy();
  });

  it("rejects a webhook with a bad signature", async () => {
    stripeMocks.webhooksConstructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const res = await request(app)
      .post("/payments/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "bad")
      .send(JSON.stringify({ id: "evt_bad" }));
    expect(res.status).toBe(400);
  });
});
