import { useEffect } from "react";
import { getSocket } from "../api/socket";

export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [event, handler]);
}
