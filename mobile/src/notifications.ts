import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api/client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Requests permission and returns this device's Expo push token, or undefined if
 * permission was denied or we're not on a physical device (push tokens don't make
 * sense on a simulator/web). Never throws. */
async function getExpoPushToken(): Promise<string | undefined> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  if (!Device.isDevice) return undefined;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return undefined;

  try {
    // A standalone/EAS build needs the project id explicitly; Expo Go can infer it.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token;
  } catch (e) {
    console.warn("Failed to obtain an Expo push token", e);
    return undefined;
  }
}

/** Call after login (and on app launch while already logged in) to make sure the
 * backend has this device's current push token. Best-effort: failures are logged,
 * never surfaced to the user — push notifications are a nice-to-have on top of the
 * WebSocket connection, not a hard requirement for the app to function. */
export async function syncPushToken(): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) return;
  try {
    await api.patch("/users/me/push-token", { token });
  } catch (e) {
    console.warn("Failed to register push token with the backend", e);
  }
}

/** Call on logout so the backend stops sending pushes for a session that ended. */
export async function clearPushToken(): Promise<void> {
  try {
    await api.delete("/users/me/push-token");
  } catch (e) {
    console.warn("Failed to clear push token on the backend", e);
  }
}
