import { describe, it, expect } from "vitest";
import { scale } from "../src/scale.js";
import type { RecipeContent, Yield } from "../src/types.js";

function content(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "Bake", timerSeconds: 1500 }],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}
const y: Yield = { amount: 16, unit: "squares" };

describe("scale", () => {
  it("halves quantities for a half batch", () => {
    const out = scale(content(), y, 8);
    expect(out.usages[0]?.quantityValue).toBe(100);
    expect(out.usages[0]?.quantityUnit).toBe("g"); // unit preserved
  });

  it("does not change step timers", () => {
    const out = scale(content(), y, 8);
    expect(out.steps[0]?.timerSeconds).toBe(1500);
  });

  it("does not mutate input and rejects non-positive yield", () => {
    const c = content();
    scale(c, y, 32);
    expect(c.usages[0]?.quantityValue).toBe(200);
    expect(() => scale(content(), { amount: 0, unit: "x" }, 8)).toThrow();
  });
});
