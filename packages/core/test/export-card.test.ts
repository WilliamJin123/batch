import { describe, it, expect } from "vitest";
import { renderCard } from "../src/export-card.js";
import type { MacroSnapshot, RecipeContent } from "../src/types.js";

const content = (): RecipeContent => ({
  steps: [
    { componentKey: "c1", order: 0, section: "Crust", instructionText: "press the crust" },
    { componentKey: "s1", order: 1, instructionText: "bake the filling", temperature: 350 },
  ],
  slots: [
    { componentKey: "graham", name: "graham crumbs", resolution: { kind: "raw", libraryIngredientId: "ing-g" } },
    { componentKey: "cc", name: "cream cheese", resolution: { kind: "raw", libraryIngredientId: "ing-cc" } },
  ],
  usages: [
    { componentKey: "u-g", stepKey: "c1", slotKey: "graham", quantityValue: 57, quantityUnit: "g" },
    { componentKey: "u-cc", stepKey: "s1", slotKey: "cc", quantityValue: 113, quantityUnit: "g" },
  ],
});

const macros = (): MacroSnapshot => ({
  total: { calories: 1721, protein: 150, carbs: 140, fat: 61, fiber: 14 },
  perServing: { calories: 215, protein: 18.9, carbs: 17.6, fat: 7.6, fiber: 1.8 },
  yield: { amount: 8, unit: "slices" },
  basis: "complete",
  unresolved: [],
  lines: [],
  caloriesPerGramProtein: 11.4,
});

describe("renderCard", () => {
  it("renders a phone-readable markdown card with macros, ratio, ingredients and numbered steps", () => {
    const md = renderCard({ name: "Turtle Cheesecake", description: "yum", yield: { amount: 8, unit: "slices" } }, content(), macros());
    expect(md).toMatch(/^# Turtle Cheesecake/m);
    expect(md).toMatch(/_yum_/);
    expect(md).toMatch(/Per slice/);
    expect(md).toMatch(/11\.4 cal\/g protein/);
    expect(md).toMatch(/## Ingredients/);
    expect(md).toMatch(/### Crust/);
    expect(md).toMatch(/- graham crumbs — 57 g/);
    expect(md).toMatch(/1\. press the crust/);
    expect(md).toMatch(/bake the filling \(350°F\)/);
  });

  it("derives the ratio from totals when the snapshot lacks the field", () => {
    const m = macros();
    delete m.caloriesPerGramProtein;
    const md = renderCard({ name: "X", yield: { amount: 8, unit: "slices" } }, content(), m);
    expect(md).toMatch(/cal\/g protein/); // 1721/150 = 11.5
  });

  it("never drops an ingredient whose usage resolves to a section no step carries", () => {
    const c = content();
    c.steps[1]!.section = "Filling"; // now no step maps to the "Base" fallback section
    // A usage pointing at a step that isn't present → its section falls back to "Base".
    // It must still surface in Ingredients, not vanish.
    c.usages.push({ componentKey: "u-x", stepKey: "ghost", slotKey: "graham", quantityValue: 5, quantityUnit: "g" });
    const md = renderCard({ name: "X", yield: { amount: 8, unit: "slices" } }, c, macros());
    expect(md).toMatch(/graham crumbs — 5 g/);
  });
});
