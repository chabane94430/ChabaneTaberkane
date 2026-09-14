import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../db";
import { AuthPayload } from "../middleware/auth";

let io: SocketIOServer | undefined;

/** Room name every socket for a given user joins, used for targeted pushes. */
function userRoom(userId: string) {
  return `user:${userId}`;
}

export function initSockets(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: "*" },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));
    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
      socket.data.auth = payload;
      next();
    } catch {
      next(new Error("Invalid auth token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const auth = socket.data.auth as AuthPayload;
    socket.join(userRoom(auth.userId));

    // Locksmith goes online: starts receiving `request:new` broadcasts.
    socket.on(
      "locksmith:online",
      async (data: { latitude: number; longitude: number }) => {
        if (auth.role !== "LOCKSMITH") return;
        await prisma.locksmithProfile.update({
          where: { userId: auth.userId },
          data: {
            isOnline: true,
            latitude: data.latitude,
            longitude: data.longitude,
            lastLocationAt: new Date(),
          },
        });
      }
    );

    socket.on("locksmith:offline", async () => {
      if (auth.role !== "LOCKSMITH") return;
      await prisma.locksmithProfile.update({
        where: { userId: auth.userId },
        data: { isOnline: false },
      });
    });

    // Locksmith periodically reports position (idle browsing or en route to a job).
    socket.on(
      "locksmith:location",
      async (data: { latitude: number; longitude: number; requestId?: string }) => {
        if (auth.role !== "LOCKSMITH") return;
        await prisma.locksmithProfile.update({
          where: { userId: auth.userId },
          data: {
            latitude: data.latitude,
            longitude: data.longitude,
            lastLocationAt: new Date(),
          },
        });

        if (data.requestId) {
          const request = await prisma.serviceRequest.findUnique({
            where: { id: data.requestId },
          });
          if (request && request.locksmithId === auth.userId) {
            emitToUser(request.clientId, "job:location", {
              requestId: data.requestId,
              latitude: data.latitude,
              longitude: data.longitude,
            });
          }
        }
      }
    );

    socket.on("disconnect", () => {
      // Presence is left as-is on disconnect; the mobile app explicitly calls
      // `locksmith:offline` when the user toggles off, and reconnects report
      // fresh location on `locksmith:online`.
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Sockets not initialized yet");
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}
