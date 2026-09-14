import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { config } from "../src/config";

const app = createApp();
const stamp = Date.now();
const password = "supersecret123";

async function registerClient(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Cancel Client",
    role: "CLIENT",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function registerLocksmith(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Cancel Locksmith",
    role: "LOCKSMITH",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function createAcceptedRequest(clientToken: string, locksmith: { token: string; id: string }) {
  await prisma.locksmithProfile.update({
    where: { userId: locksmith.id },
    data: { isOnline: true, latitude: 48.8566, longitude: 2.3522, lastLocationAt: new Date() },
  });
  const createRes = await request(app)
    .post("/requests")
    .set("Authorization", `Bearer ${clientToken}`)
    .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
  const requestId = createRes.body.request.id;
  await request(app).post(`/requests/${requestId}/accept`).set("Authorization", `Bearer ${locksmith.token}`);
  return requestId;
}

describe("cancellation penalties", () => {
  beforeAll(async () => {
    await prisma.locksmithProfile.updateMany({ data: { isOnline: false } });
  });

  it("charges no fee when the client cancels a still-PENDING request", async () => {
    const client = await registerClient(`cancel-pending-${stamp}@test.dev`);
    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    const requestId = createRes.body.request.id;

    const res = await request(app)
      .patch(`/requests/${requestId}/status`)
      .set("Authorization", `Bearer ${client.token}`)
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.request.cancellationFee).toBeNull();
  });

  it("charges the late-cancellation fee when the client cancels after a locksmith accepted", async () => {
    const client = await registerClient(`cancel-late-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`cancel-late-locksmith-${stamp}@test.dev`);
    const requestId = await createAcceptedRequest(client.token, locksmith);

    const res = await request(app)
      .patch(`/requests/${requestId}/status`)
      .set("Authorization", `Bearer ${client.token}`)
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.request.cancellationFee).toBe(config.lateCancellationFeeEur);
    expect(res.body.request.cancelReason).toBe("CLIENT_CANCELLED");
  });

  it("does not charge the client when the locksmith is the one who cancels", async () => {
    const client = await registerClient(`cancel-bylocksmith-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`cancel-bylocksmith-locksmith-${stamp}@test.dev`);
    const requestId = await createAcceptedRequest(client.token, locksmith);

    const res = await request(app)
      .patch(`/requests/${requestId}/status`)
      .set("Authorization", `Bearer ${locksmith.token}`)
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.request.cancellationFee).toBeNull();
    expect(res.body.request.cancelReason).toBe("LOCKSMITH_CANCELLED");

    const profile = await prisma.locksmithProfile.findUnique({ where: { userId: locksmith.id } });
    expect(profile?.cancelledJobsCount).toBe(1);
    expect(profile?.suspended).toBe(false);
  });

  it("suspends a locksmith after reaching the cancellation strike threshold, blocking future accepts and going online", async () => {
    const locksmith = await registerLocksmith(`cancel-strikes-${stamp}@test.dev`);

    for (let i = 0; i < config.maxLocksmithCancellations; i++) {
      const client = await registerClient(`cancel-strikes-client-${stamp}-${i}@test.dev`);
      const requestId = await createAcceptedRequest(client.token, locksmith);
      const res = await request(app)
        .patch(`/requests/${requestId}/status`)
        .set("Authorization", `Bearer ${locksmith.token}`)
        .send({ status: "CANCELLED" });
      expect(res.status).toBe(200);
    }

    const profile = await prisma.locksmithProfile.findUnique({ where: { userId: locksmith.id } });
    expect(profile?.cancelledJobsCount).toBe(config.maxLocksmithCancellations);
    expect(profile?.suspended).toBe(true);
    expect(profile?.isOnline).toBe(false);

    // Can no longer accept a new request once suspended.
    const newClient = await registerClient(`cancel-strikes-newclient-${stamp}@test.dev`);
    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { isOnline: true, latitude: 48.8566, longitude: 2.3522, lastLocationAt: new Date() },
    });
    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${newClient.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    const acceptRes = await request(app)
      .post(`/requests/${createRes.body.request.id}/accept`)
      .set("Authorization", `Bearer ${locksmith.token}`);
    expect(acceptRes.status).toBe(403);
  });

  it("allows the client to cancel once the locksmith has arrived, still charging the fee", async () => {
    const client = await registerClient(`cancel-arrived-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`cancel-arrived-locksmith-${stamp}@test.dev`);
    const requestId = await createAcceptedRequest(client.token, locksmith);
    await request(app)
      .patch(`/requests/${requestId}/status`)
      .set("Authorization", `Bearer ${locksmith.token}`)
      .send({ status: "ARRIVED" });

    const res = await request(app)
      .patch(`/requests/${requestId}/status`)
      .set("Authorization", `Bearer ${client.token}`)
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.request.cancellationFee).toBe(config.lateCancellationFeeEur);
  });
});
