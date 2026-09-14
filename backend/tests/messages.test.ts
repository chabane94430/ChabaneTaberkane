import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp();
const stamp = Date.now();
const password = "supersecret123";

async function registerClient(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Chat Client",
    role: "CLIENT",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function registerLocksmith(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Chat Locksmith",
    role: "LOCKSMITH",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

describe("chat between client and locksmith", () => {
  beforeAll(async () => {
    await prisma.locksmithProfile.updateMany({ data: { isOnline: false } });
  });

  it("blocks chat before a locksmith is assigned, allows it once accepted, and enforces ownership", async () => {
    const client = await registerClient(`chat-client-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`chat-locksmith-${stamp}@test.dev`);
    const outsider = await registerClient(`chat-outsider-${stamp}@test.dev`);

    await prisma.locksmithProfile.update({
      where: { userId: locksmith.id },
      data: { isOnline: true, latitude: 48.8566, longitude: 2.3522, lastLocationAt: new Date() },
    });

    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    const requestId = createRes.body.request.id;

    const tooEarly = await request(app)
      .post(`/requests/${requestId}/messages`)
      .set("Authorization", `Bearer ${client.token}`)
      .send({ body: "Anyone there?" });
    expect(tooEarly.status).toBe(409);

    await request(app).post(`/requests/${requestId}/accept`).set("Authorization", `Bearer ${locksmith.token}`);

    const outsiderAttempt = await request(app)
      .post(`/requests/${requestId}/messages`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ body: "I shouldn't be able to post here" });
    expect(outsiderAttempt.status).toBe(403);

    const fromClient = await request(app)
      .post(`/requests/${requestId}/messages`)
      .set("Authorization", `Bearer ${client.token}`)
      .send({ body: "J'arrive dans 5 minutes ?" });
    expect(fromClient.status).toBe(201);
    expect(fromClient.body.message.senderId).toBe(client.id);

    const fromLocksmith = await request(app)
      .post(`/requests/${requestId}/messages`)
      .set("Authorization", `Bearer ${locksmith.token}`)
      .send({ body: "Oui, j'arrive !" });
    expect(fromLocksmith.status).toBe(201);

    const history = await request(app)
      .get(`/requests/${requestId}/messages`)
      .set("Authorization", `Bearer ${client.token}`);
    expect(history.status).toBe(200);
    expect(history.body.messages).toHaveLength(2);
    expect(history.body.messages[0].body).toBe("J'arrive dans 5 minutes ?");

    const outsiderHistory = await request(app)
      .get(`/requests/${requestId}/messages`)
      .set("Authorization", `Bearer ${outsider.token}`);
    expect(outsiderHistory.status).toBe(403);
  });

  it("rejects an empty message body", async () => {
    const client = await registerClient(`chat-empty-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`chat-empty-locksmith-${stamp}@test.dev`);
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

    const res = await request(app)
      .post(`/requests/${requestId}/messages`)
      .set("Authorization", `Bearer ${client.token}`)
      .send({ body: "" });
    expect(res.status).toBe(400);
  });
});
