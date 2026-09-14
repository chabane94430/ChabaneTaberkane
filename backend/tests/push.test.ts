import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { sendPushNotification } from "../src/push";

const app = createApp();
const stamp = Date.now();
const password = "supersecret123";

async function registerClient(email: string) {
  const res = await request(app).post("/auth/register").send({
    email,
    password,
    fullName: "Push Test Client",
    role: "CLIENT",
  });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

describe("push token registration", () => {
  it("rejects an empty token", async () => {
    const client = await registerClient(`push-empty-${stamp}@test.dev`);
    const res = await request(app)
      .patch("/users/me/push-token")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ token: "" });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app).patch("/users/me/push-token").send({ token: "ExponentPushToken[abc]" });
    expect(res.status).toBe(401);
  });

  it("stores and clears the token", async () => {
    const client = await registerClient(`push-store-${stamp}@test.dev`);

    const setRes = await request(app)
      .patch("/users/me/push-token")
      .set("Authorization", `Bearer ${client.token}`)
      .send({ token: "ExponentPushToken[abc123]" });
    expect(setRes.status).toBe(200);

    const afterSet = await prisma.user.findUnique({ where: { id: client.id } });
    expect(afterSet?.pushToken).toBe("ExponentPushToken[abc123]");

    const clearRes = await request(app)
      .delete("/users/me/push-token")
      .set("Authorization", `Bearer ${client.token}`);
    expect(clearRes.status).toBe(200);

    const afterClear = await prisma.user.findUnique({ where: { id: client.id } });
    expect(afterClear?.pushToken).toBeNull();
  });
});

describe("sendPushNotification", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { status: "ok" } }), { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls the Expo push API when the user has a valid token", async () => {
    const client = await registerClient(`push-send-${stamp}@test.dev`);
    await prisma.user.update({ where: { id: client.id }, data: { pushToken: "ExponentPushToken[valid123]" } });

    await sendPushNotification(client.id, "Titre", "Corps du message", { requestId: "abc" });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.to).toBe("ExponentPushToken[valid123]");
    expect(body.title).toBe("Titre");
    expect(body.body).toBe("Corps du message");
    expect(body.data).toEqual({ requestId: "abc" });
  });

  it("does not call the API when the user has no token", async () => {
    const client = await registerClient(`push-notoken-${stamp}@test.dev`);
    await sendPushNotification(client.id, "Titre", "Corps");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not call the API when the token looks invalid", async () => {
    const client = await registerClient(`push-badtoken-${stamp}@test.dev`);
    await prisma.user.update({ where: { id: client.id }, data: { pushToken: "not-a-real-token" } });
    await sendPushNotification(client.id, "Titre", "Corps");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never throws, even if the Expo API call fails", async () => {
    const client = await registerClient(`push-fail-${stamp}@test.dev`);
    await prisma.user.update({ where: { id: client.id }, data: { pushToken: "ExponentPushToken[willfail]" } });
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await expect(sendPushNotification(client.id, "Titre", "Corps")).resolves.toBeUndefined();
  });

  it("never throws for an unknown user id", async () => {
    await expect(sendPushNotification("does-not-exist", "Titre", "Corps")).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
