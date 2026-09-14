import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendPushNotification } from "../push";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN"));

// GET /admin/stats — headline numbers for the dashboard landing view.
adminRouter.get("/stats", async (_req, res) => {
  const [clientCount, locksmithCount, requestsByStatus, paidRequests, pendingVerifications, suspendedLocksmiths] =
    await Promise.all([
      prisma.user.count({ where: { role: "CLIENT" } }),
      prisma.user.count({ where: { role: "LOCKSMITH" } }),
      prisma.serviceRequest.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.serviceRequest.findMany({ where: { paymentStatus: "PAID" }, select: { finalPrice: true } }),
      prisma.locksmithProfile.count({ where: { verificationStatus: "PENDING" } }),
      prisma.locksmithProfile.count({ where: { suspended: true } }),
    ]);

  const totalRevenue = paidRequests.reduce((sum, r) => sum + (r.finalPrice ?? 0), 0);

  return res.json({
    clientCount,
    locksmithCount,
    requestsByStatus: Object.fromEntries(requestsByStatus.map((r) => [r.status, r._count._all])),
    totalRevenue,
    paidRequestCount: paidRequests.length,
    pendingVerifications,
    suspendedLocksmiths,
  });
});

const listRequestsQuery = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "ARRIVED", "COMPLETED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// GET /admin/requests — browse/filter requests (moderation, disputes).
adminRouter.get("/requests", async (req, res) => {
  const parsed = listRequestsQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const requests = await prisma.serviceRequest.findMany({
    where: parsed.data.status ? { status: parsed.data.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit,
    include: {
      client: { select: { id: true, fullName: true, email: true } },
      locksmith: { select: { id: true, fullName: true, email: true } },
      review: true,
    },
  });
  return res.json({ requests });
});

// GET /admin/locksmiths — browse locksmiths with verification/suspension/rating state.
adminRouter.get("/locksmiths", async (_req, res) => {
  const locksmiths = await prisma.user.findMany({
    where: { role: "LOCKSMITH" },
    include: { locksmithProfile: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ locksmiths });
});

const verificationSchema = z.object({ status: z.enum(["VERIFIED", "REJECTED"]) });

// PATCH /admin/locksmiths/:id/verification — approve or reject a submitted ID document.
adminRouter.patch("/locksmiths/:id/verification", async (req, res) => {
  const parsed = verificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const profile = await prisma.locksmithProfile.findUnique({ where: { userId: req.params.id } });
  if (!profile) return res.status(404).json({ error: "Locksmith not found" });

  const updated = await prisma.locksmithProfile.update({
    where: { userId: req.params.id },
    data: { verificationStatus: parsed.data.status },
  });

  void sendPushNotification(
    req.params.id,
    parsed.data.status === "VERIFIED" ? "Identité vérifiée" : "Document refusé",
    parsed.data.status === "VERIFIED"
      ? "Votre identité a été vérifiée avec succès."
      : "Votre document n'a pas pu être vérifié, merci d'en soumettre un nouveau.",
    { type: "verification:status" }
  );

  return res.json({ profile: updated });
});

const suspendSchema = z.object({ suspended: z.boolean() });

// PATCH /admin/locksmiths/:id/suspend — manual override (e.g. lift an auto-suspension
// after review, or suspend for a reason unrelated to the cancellation-strike system).
adminRouter.patch("/locksmiths/:id/suspend", async (req, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const profile = await prisma.locksmithProfile.findUnique({ where: { userId: req.params.id } });
  if (!profile) return res.status(404).json({ error: "Locksmith not found" });

  const updated = await prisma.locksmithProfile.update({
    where: { userId: req.params.id },
    data: {
      suspended: parsed.data.suspended,
      // Lifting a suspension also clears the strike counter — a clean slate.
      cancelledJobsCount: parsed.data.suspended ? profile.cancelledJobsCount : 0,
      isOnline: parsed.data.suspended ? false : profile.isOnline,
    },
  });

  void sendPushNotification(
    req.params.id,
    parsed.data.suspended ? "Compte suspendu" : "Compte réactivé",
    parsed.data.suspended
      ? "Votre compte a été suspendu par un administrateur."
      : "Votre compte a été réactivé, vous pouvez de nouveau recevoir des demandes.",
    { type: "account:status" }
  );

  return res.json({ profile: updated });
});

// GET /admin/pricing-rules — current admin-set price overrides (see src/pricing.ts).
adminRouter.get("/pricing-rules", async (_req, res) => {
  const rules = await prisma.pricingRule.findMany({ orderBy: { issueType: "asc" } });
  return res.json({ rules });
});

const pricingRuleSchema = z.object({
  priceMin: z.number().int().positive(),
  priceMax: z.number().int().positive(),
});

// PUT /admin/pricing-rules/:issueType — set (or update) the price band for an issue type.
adminRouter.put("/pricing-rules/:issueType", async (req, res) => {
  const parsed = pricingRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.priceMin > parsed.data.priceMax) {
    return res.status(400).json({ error: "priceMin cannot be greater than priceMax" });
  }

  const rule = await prisma.pricingRule.upsert({
    where: { issueType: req.params.issueType },
    create: { issueType: req.params.issueType, ...parsed.data },
    update: parsed.data,
  });
  return res.json({ rule });
});

// DELETE /admin/pricing-rules/:issueType — revert to the hardcoded default price band.
adminRouter.delete("/pricing-rules/:issueType", async (req, res) => {
  await prisma.pricingRule.deleteMany({ where: { issueType: req.params.issueType } });
  return res.json({ ok: true });
});
