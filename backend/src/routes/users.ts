import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

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
