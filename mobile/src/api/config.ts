// Point this at your backend. On a physical device or emulator "localhost" won't
// resolve to your dev machine — use your LAN IP (e.g. http://192.168.1.20:4000)
// or a tunneled URL (ngrok, Expo tunnel) instead.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
