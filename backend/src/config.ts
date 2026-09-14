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
};
