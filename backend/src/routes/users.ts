import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadIdDocument, publicUrlFor } from "../uploads";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { locksmithProfile: true },
  });
  if (!user) return res.status(404).json({ error: "Not found" });
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return res.json({ user: publicUser });
});

const profileSchema = z.object({
  bio: z.string().max(1000).optional(),
  yearsExperience: z.number().int().min(0).optional(),
});

usersRouter.patch("/me/locksmith-profile", requireRole("LOCKSMITH"), async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const profile = await prisma.locksmithProfile.update({
    where: { userId: req.auth!.userId },
    data: parsed.data,
  });
  return res.json({ profile });
});

// POST /users/me/locksmith-profile/id-document — locksmith uploads an ID document
// (multipart/form-data, field "document") for manual admin review; the mobile app
// stays fully usable while UNVERIFIED, this is purely a trust signal shown to clients
// and reviewed in the admin back-office (see routes/admin.ts).
usersRouter.post("/me/locksmith-profile/id-document", requireRole("LOCKSMITH"), (req, res) => {
  uploadIdDocument(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No document uploaded (expected field 'document')" });

    const profile = await prisma.locksmithProfile.update({
      where: { userId: req.auth!.userId },
      data: { idDocumentUrl: publicUrlFor("ids", req.file.filename), verificationStatus: "PENDING" },
    });
    return res.status(201).json({ profile });
  });
});

const pushTokenSchema = z.object({ token: z.string().min(1) });

// PATCH /users/me/push-token — register (or update) this device's Expo push token,
// so the app can be woken up with a notification even when it's backgrounded.
usersRouter.patch("/me/push-token", async (req, res) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { pushToken: parsed.data.token },
  });
  return res.json({ ok: true });
});

// DELETE /users/me/push-token — called on logout so a stale token doesn't keep firing.
usersRouter.delete("/me/push-token", async (req, res) => {
  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { pushToken: null },
  });
  return res.json({ ok: true });
});
