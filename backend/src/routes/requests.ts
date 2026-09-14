import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { distanceKm, estimatePrice } from "../utils/geo";
import { emitToUser } from "../sockets/index";
import { config } from "../config";
import { startMatching, stopMatching } from "../matching";

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

const createSchema = z.object({
  issueType: z.enum([
    "DOOR_LOCKOUT",
    "CAR_LOCKOUT",
    "LOCK_CHANGE",
    "BROKEN_KEY",
    "SAFE_OPENING",
    "SECURITY_UPGRADE",
    "OTHER",
  ]),
  description: z.string().max(1000).optional(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().optional(),
});

// POST /requests — client creates a new service request; broadcast to nearby online locksmiths.
requestsRouter.post("/", requireRole("CLIENT"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { issueType, description, latitude, longitude, address } = parsed.data;
  const { min, max } = estimatePrice(issueType);

  const request = await prisma.serviceRequest.create({
    data: {
      clientId: req.auth!.userId,
      issueType,
      description,
      latitude,
      longitude,
      address,
      priceEstimateMin: min,
      priceEstimateMax: max,
    },
  });

  const nearby = await findNearbyOnlineLocksmiths(latitude, longitude, config.broadcastRadiusKm);
  for (const locksmith of nearby) {
    emitToUser(locksmith.userId, "request:new", serializeRequestForLocksmith(request, locksmith.distanceKm));
  }
  // If nobody accepts in time, this keeps re-broadcasting with a wider radius until
  // someone does, or gives up and auto-cancels the request (see src/matching.ts).
  startMatching(
    request.id,
    config.broadcastRadiusKm,
    nearby.map((n) => n.userId)
  );

  return res.status(201).json({ request, notifiedLocksmiths: nearby.length });
});

// GET /requests/mine — history for the current user (client sees their requests, locksmith sees jobs).
requestsRouter.get("/mine", async (req, res) => {
  const { userId, role } = req.auth!;
  const requests = await prisma.serviceRequest.findMany({
    where: role === "CLIENT" ? { clientId: userId } : { locksmithId: userId },
    orderBy: { createdAt: "desc" },
    include: { review: true },
  });
  return res.json({ requests });
});

// GET /requests/nearby — locksmith browses currently pending requests near their location.
requestsRouter.get("/nearby", requireRole("LOCKSMITH"), async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({ error: "latitude and longitude query params are required" });
  }
  const radiusKm = Number(req.query.radiusKm ?? config.broadcastRadiusKm);

  const pending = await prisma.serviceRequest.findMany({ where: { status: "PENDING" } });
  const nearby = pending
    .map((r) => ({ request: r, distanceKm: distanceKm(latitude, longitude, r.latitude, r.longitude) }))
    .filter((r) => r.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return res.json({
    requests: nearby.map(({ request, distanceKm: d }) => serializeRequestForLocksmith(request, d)),
  });
});

// GET /requests/:id
requestsRouter.get("/:id", async (req, res) => {
  const request = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: "Not found" });
  if (request.clientId !== req.auth!.userId && request.locksmithId !== req.auth!.userId) {
    return res.status(403).json({ error: "Not your request" });
  }
  return res.json({ request });
});

// POST /requests/:id/accept — first locksmith to accept wins (atomic conditional update).
requestsRouter.post("/:id/accept", requireRole("LOCKSMITH"), async (req, res) => {
  const { id } = req.params;

  const result = await prisma.serviceRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "ACCEPTED", locksmithId: req.auth!.userId, acceptedAt: new Date() },
  });

  if (result.count === 0) {
    return res.status(409).json({ error: "Request no longer available" });
  }
  stopMatching(id);

  const request = await prisma.serviceRequest.findUnique({ where: { id } });
  const locksmith = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { locksmithProfile: true },
  });

  emitToUser(request!.clientId, "request:accepted", {
    request,
    locksmith: locksmith
      ? {
          id: locksmith.id,
          fullName: locksmith.fullName,
          phone: locksmith.phone,
          rating: locksmith.locksmithProfile?.ratingAvg,
          latitude: locksmith.locksmithProfile?.latitude,
          longitude: locksmith.locksmithProfile?.longitude,
        }
      : undefined,
  });

  return res.json({ request });
});

const statusUpdateSchema = z.object({
  status: z.enum(["ARRIVED", "COMPLETED", "CANCELLED"]),
  finalPrice: z.number().positive().optional(),
});

// PATCH /requests/:id/status — locksmith marks arrived/completed, or either side cancels.
requestsRouter.patch("/:id/status", async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { status, finalPrice } = parsed.data;
  const { userId, role } = req.auth!;

  const request = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: "Not found" });

  const isOwner = request.clientId === userId || request.locksmithId === userId;
  if (!isOwner) return res.status(403).json({ error: "Not your request" });

  if (status === "CANCELLED" && !["PENDING", "ACCEPTED"].includes(request.status)) {
    return res.status(409).json({ error: `Cannot cancel a request in status ${request.status}` });
  }
  if ((status === "ARRIVED" || status === "COMPLETED") && role !== "LOCKSMITH") {
    return res.status(403).json({ error: "Only the assigned locksmith can update this status" });
  }
  if (status === "COMPLETED" && request.status !== "ARRIVED") {
    return res.status(409).json({ error: "Locksmith must mark ARRIVED before COMPLETED" });
  }

  if (status === "CANCELLED") {
    stopMatching(request.id);
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: request.id },
    data: {
      status,
      finalPrice: status === "COMPLETED" ? finalPrice ?? request.priceEstimateMax : undefined,
      arrivedAt: status === "ARRIVED" ? new Date() : undefined,
      completedAt: status === "COMPLETED" ? new Date() : undefined,
      cancelledAt: status === "CANCELLED" ? new Date() : undefined,
      cancelReason: status === "CANCELLED" ? (role === "CLIENT" ? "CLIENT_CANCELLED" : "LOCKSMITH_CANCELLED") : undefined,
    },
  });

  const otherPartyId = userId === request.clientId ? request.locksmithId : request.clientId;
  if (otherPartyId) {
    emitToUser(otherPartyId, "request:status", { request: updated });
  }

  return res.json({ request: updated });
});

async function findNearbyOnlineLocksmiths(latitude: number, longitude: number, radiusKm: number) {
  const online = await prisma.locksmithProfile.findMany({
    where: { isOnline: true, latitude: { not: null }, longitude: { not: null } },
  });
  return online
    .map((p) => ({
      userId: p.userId,
      distanceKm: distanceKm(latitude, longitude, p.latitude!, p.longitude!),
    }))
    .filter((p) => p.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRequestForLocksmith(request: any, distanceKm: number) {
  return { ...request, distanceKm: Math.round(distanceKm * 10) / 10 };
}
