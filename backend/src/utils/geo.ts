/** Great-circle distance between two points, in kilometers (haversine formula). */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Rough price estimate (EUR) from issue type + distance; a real system would price per market. */
const BASE_PRICE: Record<string, [number, number]> = {
  DOOR_LOCKOUT: [60, 120],
  CAR_LOCKOUT: [70, 140],
  LOCK_CHANGE: [90, 200],
  BROKEN_KEY: [50, 100],
  SAFE_OPENING: [150, 400],
  SECURITY_UPGRADE: [120, 350],
  OTHER: [60, 150],
};

export function estimatePrice(issueType: string): { min: number; max: number } {
  const [min, max] = BASE_PRICE[issueType] ?? BASE_PRICE.OTHER;
  return { min, max };
}
