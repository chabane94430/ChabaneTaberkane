import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { emitToUser } from "../sockets/index";
import { sendPushNotification } from "../push";

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

// Chat only makes sense once a locksmith is assigned, and stays open through completion
// so either side can still follow up (e.g. "I left my keys with the neighbor").
const CHAT_ALLOWED_STATUSES = ["ACCEPTED", "ARRIVED", "COMPLETED"];

async function loadAuthorizedRequest(requestId: string, userId: string) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request) return { error: 404 as const };
  if (request.clientId !== userId && request.locksmithId !== userId) return { error: 403 as const };
  return { request };
}

// GET /requests/:id/messages — full chat history for this job.
messagesRouter.get("/:id/messages", async (req, res) => {
  const result = await loadAuthorizedRequest(req.params.id, req.auth!.userId);
  if (result.error === 404) return res.status(404).json({ error: "Not found" });
  if (result.error === 403) return res.status(403).json({ error: "Not your request" });

  const messages = await prisma.message.findMany({
    where: { requestId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  return res.json({ messages });
});

const sendSchema = z.object({ body: z.string().min(1).max(2000) });

// POST /requests/:id/messages — send a chat message to the other party on this job.
messagesRouter.post("/:id/messages", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await loadAuthorizedRequest(req.params.id, req.auth!.userId);
  if (result.error === 404) return res.status(404).json({ error: "Not found" });
  if (result.error === 403) return res.status(403).json({ error: "Not your request" });
  const { request } = result;

  if (!CHAT_ALLOWED_STATUSES.includes(request.status)) {
    return res.status(409).json({ error: "Chat is only available once a locksmith is assigned" });
  }

  const message = await prisma.message.create({
    data: { requestId: request.id, senderId: req.auth!.userId, body: parsed.data.body },
  });

  const recipientId = req.auth!.userId === request.clientId ? request.locksmithId : request.clientId;
  if (recipientId) {
    emitToUser(recipientId, "message:new", { message });
    void sendPushNotification(recipientId, "Nouveau message", parsed.data.body, {
      type: "message:new",
      requestId: request.id,
    });
  }

  return res.status(201).json({ message });
});
