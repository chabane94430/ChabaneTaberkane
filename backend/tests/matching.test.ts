import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { config } from "../src/config";

const app = createApp();
const stamp = Date.now();
const password = "supersecret123";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerClient(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Test Client",
    role: "CLIENT",
  });
  return res.body.token as string;
}

async function registerLocksmith(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Test Locksmith",
    role: "LOCKSMITH",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

// These tests use real (short) delays rather than fake timers: matching.ts's tick()
// does genuine async DB round-trips between setTimeout calls, and Vitest's fake-timer
// flushing doesn't reliably wait for that real I/O to settle before the assertions run.

describe("re-broadcast timeout + radius expansion", () => {
  let originalConfig: typeof config;

  beforeAll(() => {
    originalConfig = { ...config };
  });

  beforeEach(async () => {
    // Other test files share the same dev.db and may leave locksmiths online —
    // start each test from a clean slate so "nobody nearby" assertions hold.
    await prisma.locksmithProfile.updateMany({ data: { isOnline: false } });
  });

  afterEach(() => {
    Object.assign(config, originalConfig);
  });

  it("auto-cancels a request with a reason when no locksmith is ever found", async () => {
    Object.assign(config, {
      acceptTimeoutSeconds: 0.03, // 30ms
      radiusStepKm: 1000, // jumps straight to max radius on the first tick
      maxRadiusKm: 115,
      maxAttemptsAtMaxRadius: 0, // give up as soon as we've tried once at max radius
    });

    const clientToken = await registerClient(`client-noloc-${stamp}@test.dev`);

    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.notifiedLocksmiths).toBe(0);
    const requestId = createRes.body.request.id;

    await sleep(200);

    const res = await request(app).get(`/requests/${requestId}`).set("Authorization", `Bearer ${clientToken}`);
    expect(res.body.request.status).toBe("CANCELLED");
    expect(res.body.request.cancelReason).toBe("NO_LOCKSMITH_AVAILABLE");
  });

  it("notifies a locksmith who only comes into range after the radius expands", async () => {
    Object.assign(config, {
      broadcastRadiusKm: 5,
      acceptTimeoutSeconds: 0.03,
      radiusStepKm: 500, // one tick is enough to cover the locksmith below
      maxRadiusKm: 1000,
      maxAttemptsAtMaxRadius: 5,
    });

    const clientToken = await registerClient(`client-expand-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`locksmith-expand-${stamp}@test.dev`);

    // ~180km away from the client — outside the initial 5km radius, inside the expanded one.
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { isOnline: true, latitude: 47.2184, longitude: -1.5536, lastLocationAt: new Date() },
    });

    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    expect(createRes.body.notifiedLocksmiths).toBe(0);
    const requestId = createRes.body.request.id;

    await sleep(150);

    const acceptRes = await request(app)
      .post(`/requests/${requestId}/accept`)
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.request.status).toBe("ACCEPTED");
  });

  it("does not auto-cancel a request after it has been accepted", async () => {
    Object.assign(config, {
      broadcastRadiusKm: 15,
      acceptTimeoutSeconds: 0.03,
      radiusStepKm: 10,
      maxRadiusKm: 20,
      maxAttemptsAtMaxRadius: 0,
    });

    const clientToken = await registerClient(`client-stable-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`locksmith-stable-${stamp}@test.dev`);
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { isOnline: true, latitude: 48.8566, longitude: 2.3522, lastLocationAt: new Date() },
    });

    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    const requestId = createRes.body.request.id;

    const acceptRes = await request(app)
      .post(`/requests/${requestId}/accept`)
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(acceptRes.status).toBe(200);

    // Well past when the request would have auto-cancelled if the timer weren't cleared.
    await sleep(200);

    const res = await request(app).get(`/requests/${requestId}`).set("Authorization", `Bearer ${clientToken}`);
    expect(res.body.request.status).toBe("ACCEPTED");
  });
});
