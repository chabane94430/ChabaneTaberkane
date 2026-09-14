import { prisma } from "./db";
import { config } from "./config";
import { distanceKm } from "./utils/geo";
import { emitToUser } from "./sockets/index";
import { sendPushNotification } from "./push";
import { ISSUE_LABELS } from "./issueLabels";

// In-memory, per-process matching state: for each PENDING request being actively
// broadcast, tracks which locksmiths have already been notified and the current
// search radius. This is intentionally not persisted — a server restart simply
// resumes broadcasting at the base radius (see resumeMatchingOnStartup below),
// which is a fine tradeoff for a single-instance MVP. A multi-instance deployment
// would move this to a shared job queue / cron instead.
interface MatchingState {
  timer: NodeJS.Timeout;
  radiusKm: number;
  notified: Set<string>;
  attemptsAtMaxRadius: number;
}

const state = new Map<string, MatchingState>();

/** Begin (or resume) broadcasting a pending request, re-broadcasting on a timer with an
 * ever-widening radius until someone accepts, the radius+attempts are exhausted, or the
 * request is otherwise no longer pending. */
export function startMatching(requestId: string, initialRadiusKm: number, alreadyNotified: string[] = []) {
  stopMatching(requestId);
  state.set(requestId, {
    timer: scheduleTick(requestId),
    radiusKm: initialRadiusKm,
    notified: new Set(alreadyNotified),
    attemptsAtMaxRadius: 0,
  });
}

export function stopMatching(requestId: string) {
  const current = state.get(requestId);
  if (current) {
    clearTimeout(current.timer);
    state.delete(requestId);
  }
}

function scheduleTick(requestId: string): NodeJS.Timeout {
  return setTimeout(() => {
    void tick(requestId);
  }, config.acceptTimeoutSeconds * 1000);
}

async function tick(requestId: string) {
  const current = state.get(requestId);
  if (!current) return;

  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") {
    stopMatching(requestId);
    return;
  }

  const nextRadius = Math.min(current.radiusKm + config.radiusStepKm, config.maxRadiusKm);
  const atMaxRadius = nextRadius >= config.maxRadiusKm;

  const online = await prisma.locksmithProfile.findMany({
    where: { isOnline: true, latitude: { not: null }, longitude: { not: null } },
  });
  const inRange = online.filter(
    (p) => distanceKm(request.latitude, request.longitude, p.latitude!, p.longitude!) <= nextRadius
  );
  const newlyInRange = inRange.filter((p) => !current.notified.has(p.userId));

  for (const locksmith of newlyInRange) {
    const d = distanceKm(request.latitude, request.longitude, locksmith.latitude!, locksmith.longitude!);
    emitToUser(locksmith.userId, "request:new", { ...request, distanceKm: Math.round(d * 10) / 10 });
    void sendPushNotification(
      locksmith.userId,
      "Nouvelle demande à proximité",
      `${ISSUE_LABELS[request.issueType] ?? request.issueType} · à ${Math.round(d * 10) / 10} km`,
      { type: "request:new", requestId: request.id }
    );
    current.notified.add(locksmith.userId);
  }

  current.radiusKm = nextRadius;
  current.attemptsAtMaxRadius = atMaxRadius ? current.attemptsAtMaxRadius + 1 : 0;

  if (atMaxRadius && current.attemptsAtMaxRadius > config.maxAttemptsAtMaxRadius) {
    await expireRequest(requestId);
    stopMatching(requestId);
    return;
  }

  current.timer = scheduleTick(requestId);
}

async function expireRequest(requestId: string) {
  const result = await prisma.serviceRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "NO_LOCKSMITH_AVAILABLE" },
  });
  if (result.count === 0) return;

  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request) return;
  emitToUser(request.clientId, "request:status", { request });
  void sendPushNotification(
    request.clientId,
    "Aucun serrurier disponible",
    "Nous n'avons trouvé aucun serrurier disponible près de chez vous pour le moment.",
    { type: "request:status", requestId: request.id, status: "CANCELLED" }
  );
}

/** Call once at process startup so a restart doesn't leave PENDING requests stuck forever. */
export async function resumeMatchingOnStartup() {
  const pending = await prisma.serviceRequest.findMany({ where: { status: "PENDING" } });
  for (const request of pending) {
    startMatching(request.id, config.broadcastRadiusKm);
  }
}
