import { describe, it, expect } from "vitest";
import { subRecipeFraction } from "../src/sub-recipe.js";

const child = (amount: number, unit: string, totalGrams: number) => ({ yield: { amount, unit }, totalGrams });

describe("subRecipeFraction", () => {
  it("rung 1: whole batch when the usage unit matches the yield unit", () => {
    expect(subRecipeFraction({ quantityValue: 1, quantityUnit: "batch" }, child(1, "batch", 150)))
      .toEqual({ fraction: 1 });
  });
  it("rung 1: a literal count against a count yield", () => {
    const r = subRecipeFraction({ quantityValue: 18, quantityUnit: "ladyfingers" }, child(24, "ladyfingers", 480));
    expect("fraction" in r && Math.abs(r.fraction - 0.75) < 1e-9).toBe(true);
  });
  it("rung 1: grams against a gram yield (same dimension)", () => {
    const r = subRecipeFraction({ quantityValue: 20, quantityUnit: "g" }, child(150, "g", 150));
    expect("fraction" in r && Math.abs(r.fraction - 20 / 150) < 1e-9).toBe(true);
  });
  it("rung 2: grams against a batch yield fall back to the child's total weight", () => {
    const r = subRecipeFraction({ quantityValue: 30, quantityUnit: "g" }, child(1, "batch", 150));
    expect("fraction" in r && Math.abs(r.fraction - 30 / 150) < 1e-9).toBe(true);
  });
  it("rung 3: unresolved when the units can't be reconciled", () => {
    const r = subRecipeFraction({ quantityValue: 1, quantityUnit: "cup" }, child(1, "batch", 150));
    expect("reason" in r).toBe(true);
  });
});
