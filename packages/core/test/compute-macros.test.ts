import { describe, it, expect } from "vitest";
import { computeMacros } from "../src/compute-macros.js";
import type { LibraryIngredient, RecipeContent, SubRecipeMacro } from "../src/types.js";

const sugar: LibraryIngredient = {
  id: "ing-sugar", name: "sugar",
  macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 },
};
const butter: LibraryIngredient = {
  id: "ing-butter", name: "butter",
  macrosPer100g: { calories: 717, protein: 0.85, carbs: 0.06, fat: 81, fiber: 0 },
};

function content(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "mix" }],
    slots: [
      { componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } },
      { componentKey: "butter", name: "butter", resolution: { kind: "raw", libraryIngredientId: "ing-butter" } },
    ],
    usages: [
      { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" },
      { componentKey: "u2", stepKey: "s1", slotKey: "butter", quantityValue: 100, quantityUnit: "g" },
    ],
  };
}

const lib = (...xs: LibraryIngredient[]) => new Map(xs.map((x) => [x.id, x]));

describe("computeMacros", () => {
  it("sums macros over usages and divides by yield for per-serving", () => {
    const snap = computeMacros(content(), { amount: 4, unit: "servings" }, lib(sugar, butter));
    expect(snap.basis).toBe("complete");
    expect(snap.unresolved).toEqual([]);
    // sugar 200 g → 774 kcal / 200 carb; butter 100 g → 717 kcal / 0.85 protein / 81 fat
    expect(snap.total.calories).toBe(1491);
    expect(snap.total.carbs).toBeCloseTo(200.06, 2);
    expect(snap.total.fat).toBe(81);
    expect(snap.perServing.calories).toBeCloseTo(372.75, 2);
  });

  it("returns a partial result that lists the unresolved usage and sums the rest", () => {
    const snap = computeMacros(content(), { amount: 4, unit: "servings" }, lib(sugar)); // butter not in library
    expect(snap.basis).toBe("partial");
    expect(snap.unresolved).toHaveLength(1);
    expect(snap.total.calories).toBe(774); // only sugar counted
    expect(snap.lines.find((l) => l.slotKey === "butter")?.status).toBe("unresolved");
    expect(snap.lines.find((l) => l.slotKey === "sugar")?.status).toBe("ok");
  });

  it("treats a sub-recipe slot as unresolved when its macros aren't provided", () => {
    const c = content();
    c.slots[0]!.resolution = { kind: "sub_recipe", subRecipeVersionId: "v-x" };
    const snap = computeMacros(c, { amount: 4, unit: "servings" }, lib(sugar, butter));
    expect(snap.basis).toBe("partial");
    expect(snap.lines.find((l) => l.slotKey === "sugar")?.status).toBe("unresolved");
  });

  it("rolls up a sub-recipe's macros scaled by the usage fraction", () => {
    const c: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "frost" }],
      slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: "v-frost" } }],
      usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" }],
    };
    const subs = new Map<string, SubRecipeMacro>([["v-frost", {
      total: { calories: 300, protein: 20, carbs: 10, fat: 18, fiber: 0 },
      yield: { amount: 1, unit: "batch" }, totalGrams: 150, basis: "complete",
    }]]);
    const snap = computeMacros(c, { amount: 5, unit: "cookies" }, new Map(), subs);
    expect(snap.basis).toBe("complete");
    expect(snap.total.calories).toBe(300);        // whole batch
    expect(snap.perServing.calories).toBe(60);    // ÷ 5
    expect(snap.lines.find((l) => l.slotKey === "frosting")?.grams).toBe(150);
  });

  it("scales a partial-batch usage and propagates a partial child", () => {
    const c: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "frost" }],
      slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: "v-frost" } }],
      usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "frosting", quantityValue: 0.5, quantityUnit: "batch" }],
    };
    const subs = new Map<string, SubRecipeMacro>([["v-frost", {
      total: { calories: 300, protein: 20, carbs: 10, fat: 18, fiber: 0 },
      yield: { amount: 1, unit: "batch" }, totalGrams: 150, basis: "partial",
    }]]);
    const snap = computeMacros(c, { amount: 5, unit: "cookies" }, new Map(), subs);
    expect(snap.total.calories).toBe(150);        // half a batch
    expect(snap.basis).toBe("partial");           // child was partial → parent partial
  });

  it("flags a sub-recipe usage whose unit can't be measured against the child's yield", () => {
    const c: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "frost" }],
      slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: "v-frost" } }],
      usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "frosting", quantityValue: 2, quantityUnit: "cups" }],
    };
    const subs = new Map<string, SubRecipeMacro>([["v-frost", {
      total: { calories: 300, protein: 20, carbs: 10, fat: 18, fiber: 0 },
      yield: { amount: 4, unit: "servings" }, totalGrams: 0, basis: "complete", // cups↔servings don't reconcile; no mass fallback
    }]]);
    const snap = computeMacros(c, { amount: 5, unit: "cookies" }, new Map(), subs);
    expect(snap.basis).toBe("partial");
    expect(snap.total.calories).toBe(0);          // nothing counted
    expect(snap.lines.find((l) => l.slotKey === "frosting")?.status).toBe("unresolved");
  });

  it("does not divide by a non-positive yield", () => {
    const snap = computeMacros(content(), { amount: 0, unit: "servings" }, lib(sugar, butter));
    expect(snap.perServing.calories).toBe(0);
    expect(snap.basis).toBe("partial"); // yield note recorded
  });
});
