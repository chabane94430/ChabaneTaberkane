import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp();
const stamp = Date.now();
const clientEmail = `client-${stamp}@test.dev`;
const locksmithEmail = `locksmith-${stamp}@test.dev`;
const password = "supersecret123";

let clientToken: string;
let locksmithToken: string;
let locksmithId: string;
let requestId: string;

describe("locksmith marketplace flow", () => {
  beforeAll(async () => {
    // Other test files share the same dev.db and may leave locksmiths online —
    // start from a clean slate so "notified 1 locksmith" style assertions hold
    // regardless of test file execution order.
    await prisma.locksmithProfile.updateMany({ data: { isOnline: false } });
  });

  it("registers a client", async () => {
    const res = await request(app).post("/auth/register").send({
      email: clientEmail,
      password,
      fullName: "Alice Client",
      role: "CLIENT",
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    clientToken = res.body.token;
  });

  it("registers a locksmith", async () => {
    const res = await request(app).post("/auth/register").send({
      email: locksmithEmail,
      password,
      fullName: "Bob Locksmith",
      role: "LOCKSMITH",
      yearsExperience: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.locksmithProfile).toBeTruthy();
    locksmithToken = res.body.token;
    locksmithId = res.body.user.id;
  });

  it("rejects duplicate email registration", async () => {
    const res = await request(app).post("/auth/register").send({
      email: clientEmail,
      password,
      fullName: "Alice Again",
      role: "CLIENT",
    });
    expect(res.status).toBe(409);
  });

  it("logs the client back in", async () => {
    const res = await request(app).post("/auth/login").send({ email: clientEmail, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects login with wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: clientEmail, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("brings the locksmith online near the client (simulating the socket handshake)", async () => {
    await prisma.locksmithProfile.update({
      where: { userId: locksmithId },
      data: { isOnline: true, latitude: 48.8566, longitude: 2.3522, lastLocationAt: new Date() },
    });
  });

  it("client creates a service request and it broadcasts to the nearby locksmith", async () => {
    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        issueType: "DOOR_LOCKOUT",
        description: "Locked out, need help ASAP",
        latitude: 48.857,
        longitude: 2.3525,
      });
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe("PENDING");
    expect(res.body.notifiedLocksmiths).toBe(1);
    requestId = res.body.request.id;
  });

  it("a client cannot create a request (role guard)", async () => {
    const res = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${locksmithToken}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 0, longitude: 0 });
    expect(res.status).toBe(403);
  });

  it("locksmith sees the pending request nearby", async () => {
    const res = await request(app)
      .get("/requests/nearby")
      .query({ latitude: 48.8566, longitude: 2.3522 })
      .set("Authorization", `Bearer ${locksmithToken}`);
    expect(res.status).toBe(200);
    expect(res.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  it("locksmith accepts the request", async () => {
    const res = await request(app)
      .post(`/requests/${requestId}/accept`)
      .set("Authorization", `Bearer ${locksmithToken}`);
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("ACCEPTED");
    expect(res.body.request.locksmithId).toBe(locksmithId);
  });

  it("a second accept attempt fails (already taken)", async () => {
    const res = await request(app)
      .post(`/requests/${requestId}/accept`)
      .set("Authorization", `Bearer ${locksmithToken}`);
    expect(res.status).toBe(409);
  });

  it("locksmith marks arrived then completed", async () => {
    const arrived = await request(app)
      .patch(`/requests/${requestId}/status`)
      .set("Authorization", `Bearer ${locksmithToken}`)
      .send({ status: "ARRIVED" });
    expect(arrived.status).toBe(200);
    expect(arrived.body.request.status).toBe("ARRIVED");

    const completed = await request(app)
      .patch(`/requests/${requestId}/status`)
      .set("Authorization", `Bearer ${locksmithToken}`)
      .send({ status: "COMPLETED", finalPrice: 95 });
    expect(completed.status).toBe(200);
    expect(completed.body.request.status).toBe("COMPLETED");
    expect(completed.body.request.finalPrice).toBe(95);
  });

  it("client rates the completed job", async () => {
    const res = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ requestId, rating: 5, comment: "Fast and professional!" });
    expect(res.status).toBe(201);

    const profile = await prisma.locksmithProfile.findUnique({ where: { userId: locksmithId } });
    expect(profile?.ratingCount).toBe(1);
    expect(profile?.ratingAvg).toBe(5);
  });

  it("cannot review the same request twice", async () => {
    const res = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ requestId, rating: 3 });
    expect(res.status).toBe(409);
  });

  it("client sees the request in their history", async () => {
    const res = await request(app).get("/requests/mine").set("Authorization", `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/requests/mine");
    expect(res.status).toBe(401);
  });
});
