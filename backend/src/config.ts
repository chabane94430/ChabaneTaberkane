import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET", "dev-secret-do-not-use-in-prod"),
  broadcastRadiusKm: Number(process.env.BROADCAST_RADIUS_KM ?? 15),
  acceptTimeoutSeconds: Number(process.env.ACCEPT_TIMEOUT_SECONDS ?? 20),
  // If nobody accepts within acceptTimeoutSeconds, the search radius grows by this
  // many km and newly-in-range online locksmiths get notified, up to maxRadiusKm.
  radiusStepKm: Number(process.env.RADIUS_STEP_KM ?? 10),
  maxRadiusKm: Number(process.env.MAX_RADIUS_KM ?? 50),
  // Extra broadcast attempts once the radius has already maxed out (catches a
  // locksmith who comes online late) before the request auto-cancels.
  maxAttemptsAtMaxRadius: Number(process.env.MAX_ATTEMPTS_AT_MAX_RADIUS ?? 2),
  // Charged to the client for cancelling after a locksmith already accepted (they may
  // already be en route). No fee while still PENDING (no locksmith committed yet).
  lateCancellationFeeEur: Number(process.env.LATE_CANCELLATION_FEE_EUR ?? 15),
  // A locksmith who cancels an accepted job this many times gets auto-suspended
  // (taken offline, blocked from accepting new requests) pending admin review.
  maxLocksmithCancellations: Number(process.env.MAX_LOCKSMITH_CANCELLATIONS ?? 3),

  // Stripe Connect (in-app payments). Left unset in dev: payment routes respond with a
  // clear 503 instead of crashing when these are missing.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || undefined,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
  platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? 15),
  // Where Stripe redirects the locksmith's browser after Connect onboarding. Point
  // these at real pages (or a deep link back into the app) before going to production.
  stripeOnboardingRefreshUrl: process.env.STRIPE_ONBOARDING_REFRESH_URL || "https://example.com/stripe/refresh",
  stripeOnboardingReturnUrl: process.env.STRIPE_ONBOARDING_RETURN_URL || "https://example.com/stripe/return",

  // Bootstraps a single admin user on first run of prisma/seed.ts (see README).
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
};
