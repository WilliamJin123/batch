import type { RecipeContent, Yield } from "./types.js";

export function scale(content: RecipeContent, from: Yield, targetServings: number): RecipeContent {
  if (from.amount <= 0) throw new Error("yield amount must be positive");
  const factor = targetServings / from.amount;
  const out = structuredClone(content);
  for (const u of out.usages) u.quantityValue = u.quantityValue * factor;
  return out;
}
