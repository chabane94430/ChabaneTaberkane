import { prisma } from "./db";
import { estimatePrice } from "./utils/geo";

/** Resolves the price band for an issue type: an admin-set PricingRule overrides the
 * hardcoded default in utils/geo.ts's estimatePrice() when one exists. */
export async function resolvePriceEstimate(issueType: string): Promise<{ min: number; max: number }> {
  const rule = await prisma.pricingRule.findUnique({ where: { issueType } });
  if (rule) return { min: rule.priceMin, max: rule.priceMax };
  return estimatePrice(issueType);
}
