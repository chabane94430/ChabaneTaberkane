import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

const createSchema = z.object({
  requestId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// POST /reviews — client rates the locksmith after a completed job.
reviewsRouter.post("/", requireRole("CLIENT"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { requestId, rating, comment } = parsed.data;

  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.clientId !== req.auth!.userId) {
    return res.status(403).json({ error: "Not your request" });
  }
  if (request.status !== "COMPLETED") {
    return res.status(409).json({ error: "Request is not completed yet" });
  }
  if (!request.locksmithId) {
    return res.status(409).json({ error: "Request has no assigned locksmith" });
  }

  const existing = await prisma.review.findUnique({ where: { requestId } });
  if (existing) return res.status(409).json({ error: "Already reviewed" });

  const review = await prisma.review.create({
    data: {
      requestId,
      authorId: req.auth!.userId,
      targetId: request.locksmithId,
      rating,
      comment,
    },
  });

  const profile = await prisma.locksmithProfile.findUnique({
    where: { userId: request.locksmithId },
  });
  if (profile) {
    const newCount = profile.ratingCount + 1;
    const newAvg = (profile.ratingAvg * profile.ratingCount + rating) / newCount;
    await prisma.locksmithProfile.update({
      where: { userId: request.locksmithId },
      data: { ratingAvg: newAvg, ratingCount: newCount },
    });
  }

  return res.status(201).json({ review });
});
