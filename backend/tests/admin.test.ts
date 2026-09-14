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
    fullName: "Admin-Test Client",
    role: "CLIENT",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function registerLocksmith(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Admin-Test Locksmith",
    role: "LOCKSMITH",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function createAdmin(email: string) {
  const passwordHash = await import("bcryptjs").then((b) => b.default.hash(password, 10));
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "ADMIN", fullName: "Admin" },
  });
  const res = await request(app).post("/auth/login").send({ email, password });
  return { token: res.body.token as string, id: user.id };
}

describe("admin back-office API", () => {
  beforeAll(async () => {
    await prisma.locksmithProfile.updateMany({ data: { isOnline: false } });
  });

  it("rejects non-admin access to every admin route", async () => {
    const client = await registerClient(`admin-guard-${stamp}@test.dev`);
    const paths = ["/admin/stats", "/admin/requests", "/admin/locksmiths", "/admin/pricing-rules"];
    for (const path of paths) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${client.token}`);
      expect(res.status).toBe(403);
    }
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/admin/stats");
    expect(res.status).toBe(401);
  });

  it("returns aggregate stats", async () => {
    const admin = await createAdmin(`admin-stats-${stamp}@test.dev`);
    const res = await request(app).get("/admin/stats").set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.clientCount).toBe("number");
    expect(typeof res.body.locksmithCount).toBe("number");
    expect(typeof res.body.totalRevenue).toBe("number");
  });

  it("lists requests and locksmiths", async () => {
    const admin = await createAdmin(`admin-lists-${stamp}@test.dev`);
    const client = await registerClient(`admin-lists-client-${stamp}@test.dev`);
    await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });

    const requestsRes = await request(app).get("/admin/requests").set("Authorization", `Bearer ${admin.token}`);
    expect(requestsRes.status).toBe(200);
    expect(Array.isArray(requestsRes.body.requests)).toBe(true);
    expect(requestsRes.body.requests.length).toBeGreaterThan(0);

    const locksmithsRes = await request(app).get("/admin/locksmiths").set("Authorization", `Bearer ${admin.token}`);
    expect(locksmithsRes.status).toBe(200);
    expect(Array.isArray(locksmithsRes.body.locksmiths)).toBe(true);
  });

  it("approves and rejects locksmith identity verification", async () => {
    const admin = await createAdmin(`admin-verify-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`admin-verify-locksmith-${stamp}@test.dev`);

    const approve = await request(app)
      .patch(`/admin/locksmiths/${locksmith.id}/verification`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "VERIFIED" });
    expect(approve.status).toBe(200);
    expect(approve.body.profile.verificationStatus).toBe("VERIFIED");

    const reject = await request(app)
      .patch(`/admin/locksmiths/${locksmith.id}/verification`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "REJECTED" });
    expect(reject.status).toBe(200);
    expect(reject.body.profile.verificationStatus).toBe("REJECTED");
  });

  it("suspends and reactivates a locksmith, resetting the strike count on reactivation", async () => {
    const admin = await createAdmin(`admin-suspend-${stamp}@test.dev`);
    const locksmith = await registerLocksmith(`admin-suspend-locksmith-${stamp}@test.dev`);
    await prisma.locksmithProfile.update({ where: { userId: locksmith.id }, data: { cancelledJobsCount: 2 } });

    const suspend = await request(app)
      .patch(`/admin/locksmiths/${locksmith.id}/suspend`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ suspended: true });
    expect(suspend.status).toBe(200);
    expect(suspend.body.profile.suspended).toBe(true);

    const reactivate = await request(app)
      .patch(`/admin/locksmiths/${locksmith.id}/suspend`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ suspended: false });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.profile.suspended).toBe(false);
    expect(reactivate.body.profile.cancelledJobsCount).toBe(0);
  });

  it("sets and clears a pricing rule override, honored by request creation", async () => {
    const admin = await createAdmin(`admin-pricing-${stamp}@test.dev`);
    const client = await registerClient(`admin-pricing-client-${stamp}@test.dev`);

    const setRule = await request(app)
      .put("/admin/pricing-rules/DOOR_LOCKOUT")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ priceMin: 500, priceMax: 900 });
    expect(setRule.status).toBe(200);

    const createRes = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    expect(createRes.body.request.priceEstimateMin).toBe(500);
    expect(createRes.body.request.priceEstimateMax).toBe(900);

    const del = await request(app)
      .delete("/admin/pricing-rules/DOOR_LOCKOUT")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(del.status).toBe(200);

    const createRes2 = await request(app)
      .post("/requests")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ issueType: "DOOR_LOCKOUT", latitude: 48.857, longitude: 2.3525 });
    expect(createRes2.body.request.priceEstimateMin).not.toBe(500);
  });

  it("rejects an invalid pricing rule (min > max)", async () => {
    const admin = await createAdmin(`admin-badpricing-${stamp}@test.dev`);
    const res = await request(app)
      .put("/admin/pricing-rules/DOOR_LOCKOUT")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ priceMin: 900, priceMax: 500 });
    expect(res.status).toBe(400);
  });
});
