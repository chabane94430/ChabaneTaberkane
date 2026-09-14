import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp();
const stamp = Date.now();
const password = "supersecret123";

// A 1x1 transparent PNG, small enough to keep the test fast.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function registerClient(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Photo Client",
    role: "CLIENT",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function registerLocksmith(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Photo Locksmith",
    role: "LOCKSMITH",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

describe("request photos", () => {
  it("lets the requesting client attach a photo, rejects everyone else", async () => {
    const client = await registerClient(`photo-client-${stamp}@test.dev`);
    const outsider = await registerClient(`photo-outsider-${stamp}@test.dev`);

    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    const requestId = createRes.body.request.id;

    const uploadRes = await request(app)
      .post(`/requests/${requestId}/photos`)
      .set("Authorization", `Bearer ${client.token}`)
      .attach("photo", TINY_PNG, "issue.png");
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.photo.url).toMatch(/^\/uploads\/requests\//);

    const outsiderRes = await request(app)
      .post(`/requests/${requestId}/photos`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .attach("photo", TINY_PNG, "issue.png");
    expect(outsiderRes.status).toBe(403);

    const getRes = await request(app).get(`/requests/${requestId}`).set("Authorization", `Bearer ${client.token}`);
    expect(getRes.body.request.photos).toHaveLength(1);
  });

  it("rejects a non-image upload", async () => {
    const client = await registerClient(`photo-badtype-${stamp}@test.dev`);
    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    const requestId = createRes.body.request.id;

    const res = await request(app)
      .post(`/requests/${requestId}/photos`)
      .set("Authorization", `Bearer ${client.token}`)
      .attach("photo", Buffer.from("not an image"), { filename: "notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  it("rejects an upload from a locksmith (client-only)", async () => {
    const client = await registerClient(`photo-role-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`photo-role-locksmith-${stamp}@test.dev`);
    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    const requestId = createRes.body.request.id;

    const res = await request(app)
      .post(`/requests/${requestId}/photos`)
      .set("Authorization", `Bearer ${locksmith.token}`)
      .attach("photo", TINY_PNG, "issue.png");
    expect(res.status).toBe(403);
  });
});

describe("locksmith identity verification", () => {
  beforeAll(async () => {
    await prisma.locksmithProfile.updateMany({ data: { isOnline: false } });
  });

  it("starts UNVERIFIED and moves to PENDING after an ID document upload", async () => {
    const locksmith = await registerLocksmith(`verify-${stamp}@test.dev`);

    const before = await prisma.locksmithProfile.findUnique({ where: { userId: locksmith.id } });
    expect(before?.verificationStatus).toBe("UNVERIFIED");

    const res = await request(app)
      .post("/users/me/locksmith-profile/id-document")
      .set("Authorization", `Bearer ${locksmith.token}`)
      .attach("document", TINY_PNG, "id-card.png");
    expect(res.status).toBe(201);
    expect(res.body.profile.verificationStatus).toBe("PENDING");
    expect(res.body.profile.idDocumentUrl).toMatch(/^\/uploads\/ids\//);
  });

  it("rejects an ID document upload from a client", async () => {
    const client = await registerClient(`verify-client-${stamp}@test.dev`);
    const res = await request(app)
      .post("/users/me/locksmith-profile/id-document")
      .set("Authorization", `Bearer ${client.token}`)
      .attach("document", TINY_PNG, "id-card.png");
    expect(res.status).toBe(403);
  });
});
