import { describe, it, expect } from "vitest";
import { RecipeService } from "../src/recipe-service.js";
import { InMemoryRepository } from "../src/in-memory-repository.js";
import { testDeps } from "../src/deps.js";
import type { RecipeContent } from "../src/types.js";

const svc = () => new RecipeService(new InMemoryRepository(), testDeps());

// A crust step (section "Crust") + an unsectioned base step, each with one ingredient.
const content = (): RecipeContent => ({
  steps: [
    { componentKey: "c1", order: 0, section: "Crust", instructionText: "press crust" },
    { componentKey: "s1", order: 1, instructionText: "bake filling" },
  ],
  slots: [
    { componentKey: "graham", name: "graham", resolution: { kind: "raw", libraryIngredientId: "ing-graham" } },
    { componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } },
  ],
  usages: [
    { componentKey: "u-g", stepKey: "c1", slotKey: "graham", quantityValue: 100, quantityUnit: "g" },
    { componentKey: "u-s", stepKey: "s1", slotKey: "sugar", quantityValue: 100, quantityUnit: "g" },
  ],
});

describe("macrosBySection", () => {
  it("attributes each usage to its step's section and sums to the total", async () => {
    const s = svc();
    await s.addIngredient({ id: "ing-graham", name: "graham", macrosPer100g: { calories: 400, protein: 6, carbs: 80, fat: 8, fiber: 3 } });
    await s.addIngredient({ id: "ing-sugar", name: "sugar", macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 } });
    const { version } = await s.createRecipe({ name: "Cheesecake", yield: { amount: 8, unit: "slices" }, content: content() });

    const { snapshot, bySection } = await s.macrosBySection(version.id);
    expect(Object.keys(bySection).sort()).toEqual(["Base", "Crust"]);
    expect(bySection["Crust"]!.calories).toBe(400);  // 100 g graham
    expect(bySection["Base"]!.calories).toBe(387);   // 100 g sugar
    const summed = bySection["Crust"]!.calories + bySection["Base"]!.calories;
    expect(summed).toBeCloseTo(snapshot.total.calories, 2);
  });
});
