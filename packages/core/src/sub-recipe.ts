import { convertWithin, massToGrams } from "./units.js";
import type { StepUsage, Yield } from "./types.js";

export type FractionResult = { fraction: number } | { reason: string };

/**
 * What fraction of a sub-recipe's batch a usage consumes (M3, DM3-2). One ladder:
 *  1. usage unit reconciles with the child's yield unit (same unit, or same dimension via
 *     the universal table) → quantity ÷ yield.amount.
 *  2. usage is a mass unit and rung 1 didn't resolve (yield not mass-convertible, or a
 *     non-positive yield.amount) → grams ÷ the child's total batch weight.
 *  3. otherwise (incl. a zero-weight child) → unresolved (never throws, never divides by zero).
 */
export function subRecipeFraction(
  usage: Pick<StepUsage, "quantityValue" | "quantityUnit">,
  child: { yield: Yield; totalGrams: number },
): FractionResult {
  const within = convertWithin(usage.quantityValue, usage.quantityUnit, child.yield.unit);
  if (within !== undefined && child.yield.amount > 0) {
    return { fraction: within / child.yield.amount };
  }
  const g = massToGrams(usage.quantityValue, usage.quantityUnit);
  if (g !== undefined && child.totalGrams > 0) {
    return { fraction: g / child.totalGrams };
  }
  return {
    reason: `can't measure a sub-recipe in "${usage.quantityUnit}" against yield unit "${child.yield.unit}" — use ${child.yield.unit} or grams`,
  };
}
