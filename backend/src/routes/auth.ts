import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { signToken } from "../middleware/auth";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(["CLIENT", "LOCKSMITH"]),
  // Locksmith-only, optional at signup
  bio: z.string().optional(),
  yearsExperience: z.number().int().min(0).optional(),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, fullName, phone, role, bio, yearsExperience } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      phone,
      role,
      locksmithProfile:
        role === "LOCKSMITH"
          ? { create: { bio, yearsExperience: yearsExperience ?? 0 } }
          : undefined,
    },
    include: { locksmithProfile: true },
  });

  const token = signToken({ userId: user.id, role: user.role as "CLIENT" | "LOCKSMITH" });
  return res.status(201).json({
    token,
    user: toPublicUser(user),
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { locksmithProfile: true },
  });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({ userId: user.id, role: user.role as "CLIENT" | "LOCKSMITH" });
  return res.json({ token, user: toPublicUser(user) });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPublicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    locksmithProfile: user.locksmithProfile ?? undefined,
  };
}
