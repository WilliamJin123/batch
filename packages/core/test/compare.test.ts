import { describe, it, expect } from "vitest";
import { buildCompareView, type CompareInput } from "../src/compare.js";
import type { LibraryIngredient, RecipeContent } from "../src/types.js";

const ing = (id: string, name: string, extra: Partial<LibraryIngredient> = {}): LibraryIngredient => ({
  id, name, macrosPer100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, ...extra,
});

function input(p: Partial<CompareInput> & Pick<CompareInput, "versionId" | "content">): CompareInput {
  return {
    recipeId: "r-" + p.versionId, name: p.versionId, isVariant: false,
    yield: { amount: 1, unit: "x" }, perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    macroBasis: "complete", feedback: [], ...p,
  } as CompareInput;
}

const flour = (key: string, slotKey: string, ingId: string, g: number, unit = "g"): RecipeContent => ({
  steps: [{ componentKey: "s1", order: 1, instructionText: "do it" }],
  slots: [{ componentKey: slotKey, name: ingId, resolution: { kind: "raw", libraryIngredientId: ingId } }],
  usages: [{ componentKey: key, stepKey: "s1", slotKey, quantityValue: g, quantityUnit: unit }],
});

describe("buildCompareView", () => {
  it("joins ingredient rows by libraryIngredientId across separate recipes (CM-1)", () => {
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-flour", 100) }),
       input({ versionId: "vB", content: flour("uB", "slB", "ing-flour", 50) })],
      new Map([["ing-flour", ing("ing-flour", "Flour")]]),
    );
    const row = view.ingredients.find((r) => r.ingredientId === "ing-flour")!;
    expect(row.perServingGrams).toEqual({ vA: 100, vB: 50 }); // yield.amount = 1
  });

  it("absent ingredient is null, not zero (CM-2)", () => {
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-cornstarch", 12) }),
       input({ versionId: "vB", content: flour("uB", "slB", "ing-flour", 50) })],
      new Map([["ing-cornstarch", ing("ing-cornstarch", "Cornstarch")], ["ing-flour", ing("ing-flour", "Flour")]]),
    );
    const corn = view.ingredients.find((r) => r.ingredientId === "ing-cornstarch")!;
    expect(corn.perServingGrams.vA).toBe(12);
    expect(corn.perServingGrams.vB).toBeNull();
  });

  it("present-but-unconvertible is \"present\", not null (CM-2)", () => {
    // a volume unit with no density cannot convert to grams
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-vanilla", 1, "tsp") })],
      new Map([["ing-vanilla", ing("ing-vanilla", "Vanilla")]]), // no densityGPerMl
    );
    expect(view.ingredients[0]?.perServingGrams.vA).toBe("present");
  });

  it("sums multiple usages of the same ingredient, divides by yield amount", () => {
    const content: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "x" }],
      slots: [{ componentKey: "sl", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
      usages: [
        { componentKey: "u1", stepKey: "s1", slotKey: "sl", quantityValue: 100, quantityUnit: "g" },
        { componentKey: "u2", stepKey: "s1", slotKey: "sl", quantityValue: 100, quantityUnit: "g" },
      ],
    };
    const view = buildCompareView(
      [input({ versionId: "v", content, yield: { amount: 4, unit: "x" } })],
      new Map([["ing-sugar", ing("ing-sugar", "Sugar")]]),
    );
    expect(view.ingredients[0]?.perServingGrams.v).toBe(50); // (100+100)/4
  });

  it("columns carry dish + component verdicts, steps are per-version", () => {
    const fb = [
      { kind: "made" as const, id: "f1", recipeId: "r-vA", versionId: "vA", rating: "excellent" as const,
        date: "2026-06-02", author: "user" as const, createdAt: "2026-06-02T00:00:00.000Z" },
      { kind: "made" as const, id: "f2", recipeId: "r-vA", versionId: "vA", rating: "bad" as const, componentKey: "sl-glaze",
        date: "2026-06-02", author: "user" as const, createdAt: "2026-06-02T00:00:00.000Z" },
    ];
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-flour", 10), feedback: fb })],
      new Map([["ing-flour", ing("ing-flour", "Flour")]]),
    );
    expect(view.columns[0]?.verdict).toBe("excellent");
    expect(view.columns[0]?.componentVerdicts["sl-glaze"]).toBe("bad");
    expect(view.steps[0]?.steps[0]?.text).toBe("do it");
  });
});
