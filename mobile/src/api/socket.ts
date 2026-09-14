import { io, Socket } from "socket.io-client";
import { API_URL } from "./config";

let socket: Socket | undefined;

export function connectSocket(token: string): Socket {
  socket?.disconnect();
  socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = undefined;
}

export function getSocket(): Socket | undefined {
  return socket;
}
