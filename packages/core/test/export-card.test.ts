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

  it("displays the canonical cook-unit · grams pair, derived from grams (not the entered unit)", () => {
    const m = macros();
    m.lines = [
      { slotKey: "graham", ingredientId: "ing-g", grams: 57, status: "ok" },
      { slotKey: "cc", ingredientId: "ing-cc", grams: 113, status: "ok" },
    ];
    const unitInfo = new Map([
      ["ing-g", { densityGPerMl: 0.42, unitEquivalences: { sheet: 14 } }],
      ["ing-cc", { densityGPerMl: 0.98 }],
    ]);
    const md = renderCard({ name: "X", yield: { amount: 8, unit: "slices" } }, content(), m, unitInfo);
    expect(md).toMatch(/cream cheese — ½ cup · 113 g/);   // 113 g of 0.98 g/ml → ½ cup
    expect(md).toMatch(/graham crumbs — \S+ (cup|tbsp|tsp) · 57 g/);
  });

  it("falls back to grams alone when the ingredient has no derivable cook unit", () => {
    const m = macros();
    m.lines = [
      { slotKey: "graham", ingredientId: "ing-g", grams: 57, status: "ok" },
      { slotKey: "cc", ingredientId: "ing-cc", grams: 113, status: "ok" },
    ];
    const unitInfo = new Map([["ing-g", {}], ["ing-cc", {}]]); // no density, no equivalences
    const md = renderCard({ name: "X", yield: { amount: 8, unit: "slices" } }, content(), m, unitInfo);
    expect(md).toMatch(/graham crumbs — 57 g/);
    expect(md).toMatch(/cream cheese — 113 g/);
  });

  it("renders recipe-level notes under Watch-outs and anchored notes inline at their step", () => {
    const c = content();
    c.notes = [
      { componentKey: "n1", kind: "pitfall", text: "do not overbake — pull while it jiggles", stepKey: "s1" },
      { componentKey: "n2", kind: "technique", text: "room-temp the cream cheese first" },
    ];
    const md = renderCard({ name: "X", yield: { amount: 8, unit: "slices" } }, c, macros());
    const watch = md.indexOf("## Watch-outs");
    const method = md.indexOf("## Method");
    expect(watch).toBeGreaterThan(-1);
    expect(watch).toBeLessThan(method);               // panel sits above the method
    expect(md).toMatch(/room-temp the cream cheese/); // unanchored technique → panel
    expect(md).toMatch(/do not overbake/);            // pitfall → panel
    // the anchored pitfall also renders inline, somewhere in the method body
    expect(md.slice(method)).toMatch(/do not overbake/);
  });
});
