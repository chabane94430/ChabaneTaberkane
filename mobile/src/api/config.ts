// Point this at your backend. On a physical device or emulator "localhost" won't
// resolve to your dev machine — use your LAN IP (e.g. http://192.168.1.20:4000)
// or a tunneled URL (ngrok, Expo tunnel) instead.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

/** Resolves a backend-relative path (e.g. "/uploads/requests/xyz.jpg") to a full URL. */
export function assetUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

// Stripe's *publishable* key (safe to ship in the app, unlike the secret key). Get one
// from https://dashboard.stripe.com/test/apikeys. Payment screens detect the empty
// placeholder and show a "not configured" state instead of crashing.
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
