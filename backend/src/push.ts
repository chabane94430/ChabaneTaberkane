import { prisma } from "./db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** A valid Expo push token looks like "ExponentPushToken[xxxxxxxx]" (or the legacy
 * "ExpoPushToken[...]" form). Anything else is a token from a dev/simulator build
 * that can't actually receive a push, so we skip it rather than call the API. */
function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/** Best-effort push notification to a user's registered device. Never throws — a
 * missing token, an unreachable Expo API, or a bad response should never break the
 * request that triggered it; Socket.IO remains the source of truth for live state,
 * this is purely a "wake the app up" nudge. */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
    const token = user?.pushToken;
    if (!token || !isExpoPushToken(token)) return;

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: token, title, body, data, sound: "default", priority: "high" }),
    });

    if (!res.ok) {
      console.warn(`Expo push request failed with status ${res.status} for user ${userId}`);
    }
  } catch (err) {
    console.warn(`Failed to send push notification to user ${userId}:`, err);
  }
}
