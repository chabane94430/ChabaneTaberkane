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
};
