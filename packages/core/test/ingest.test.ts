import { describe, it, expect } from "vitest";
import { parseIngredientLine, parseMarkdownRecipe, matchIngredient, ingestMarkdown } from "../src/ingest.js";
import type { LibraryIngredient } from "../src/types.js";

describe("parseIngredientLine", () => {
  const P = parseIngredientLine;
  it("parses '<qty> <unit> <name>'", () => {
    expect(P("- 170 g Plain Nonfat Greek Yogurt")).toMatchObject({ quantity: 170, unit: "g", name: "Plain Nonfat Greek Yogurt" });
  });
  it("reads unicode fractions, mixed numbers, and 'or' alternatives", () => {
    expect(P("½ cup unsweetened applesauce")).toMatchObject({ quantity: 0.5, unit: "cup", name: "unsweetened applesauce" });
    expect(P("1½ tbsp Fairlife milk or milk of choice")).toMatchObject({ quantity: 1.5, unit: "tbsp", name: "Fairlife milk", note: expect.stringContaining("or milk of choice") });
    const r = P("1⅓ scoops Vanilla Protein Powder");
    expect(r.quantity).toBeCloseTo(1.333, 2);
    expect(r.unit).toBe("scoop");
    expect(r.name).toBe("Vanilla Protein Powder");
  });
  it("treats a bare measure word as quantity 1", () => {
    expect(P("Pinch Salt")).toMatchObject({ quantity: 1, unit: "pinch", name: "Salt" });
  });
  it("keeps egg size words as the unit and maps 'count' to each", () => {
    expect(P("1 medium Egg")).toMatchObject({ quantity: 1, unit: "medium", name: "Egg" });
    expect(P("2 count eggs")).toMatchObject({ quantity: 2, unit: "each", name: "eggs" });
  });
  it("does not invent a unit from a non-unit second word", () => {
    expect(P("21 Lady Fingers")).toMatchObject({ quantity: 21, unit: undefined, name: "Lady Fingers" });
    expect(P("1 cosmic sprinkles")).toMatchObject({ quantity: 1, unit: undefined, name: "cosmic sprinkles" });
  });
  it("splits a trailing prep qualifier into a note", () => {
    expect(P("4 oz reduced-fat cream cheese, softened")).toMatchObject({ quantity: 4, unit: "oz", name: "reduced-fat cream cheese", note: "softened" });
  });
  it("normalizes Tbs/tablespoon aliases", () => {
    expect(P("1 Tbs Cocoa Powder")).toMatchObject({ quantity: 1, unit: "tbsp", name: "Cocoa Powder" });
  });
});

describe("parseMarkdownRecipe", () => {
  const md = `# 90 Calorie Lemon Blueberry Bread

![img](http://x/y.jpg)

- **⏱** 60 minutes
- **Servings** 8
- **Source** instagram

A light and healthy lemon blueberry bread.

## Ingredients
- 1 medium Egg
- 170 g Plain Nonfat Greek Yogurt
- ½ cup unsweetened applesauce

## Directions

**1.** Preheat oven to 350 degrees. (2 minutes)

**2.** Mix and bake.

## Source
[instagram](http://x)`;
  it("pulls title, servings, description, ingredients, and step text with the (minutes) stripped", () => {
    const r = parseMarkdownRecipe(md);
    expect(r.title).toBe("90 Calorie Lemon Blueberry Bread");
    expect(r.servings).toBe(8);
    expect(r.description).toBe("A light and healthy lemon blueberry bread.");
    expect(r.ingredients).toHaveLength(3);
    expect(r.steps.map((s) => s.text)).toEqual(["Preheat oven to 350 degrees.", "Mix and bake."]);
  });
});

const LIB: LibraryIngredient[] = [
  { id: "ing-greek-yogurt-nonfat", name: "0% Greek yogurt", macrosPer100g: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0 } },
  { id: "ing-egg-whole", name: "whole egg", macrosPer100g: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 } },
  { id: "ing-ap-flour", name: "all-purpose flour", macrosPer100g: { calories: 364, protein: 10, carbs: 76, fat: 1, fiber: 2.7 } },
  { id: "ing-splenda-granulated", name: "granulated Splenda", macrosPer100g: { calories: 400, protein: 0, carbs: 100, fat: 0, fiber: 0 } },
  { id: "ing-monk-fruit-powdered", name: "powdered monk fruit sweetener", macrosPer100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } },
  { id: "ing-banana", name: "ripe banana", macrosPer100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 } },
  { id: "ing-cocoa-powder", name: "unsweetened cocoa powder", macrosPer100g: { calories: 228, protein: 19.6, carbs: 58, fat: 13.7, fiber: 37 } },
  { id: "ing-chocolate-chips-semisweet", name: "semi-sweet chocolate chips", macrosPer100g: { calories: 479, protein: 4.2, carbs: 63.9, fat: 30, fiber: 5.9 } },
  { id: "ing-sprinkles", name: "rainbow sprinkles", macrosPer100g: { calories: 389, protein: 0, carbs: 90, fat: 4, fiber: 0 } },
  { id: "ing-walnuts", name: "chopped walnuts", macrosPer100g: { calories: 654, protein: 15.2, carbs: 13.7, fat: 65.2, fiber: 6.7 } },
];

describe("matchIngredient", () => {
  it("maps house staples through synonyms/keywords", () => {
    expect(matchIngredient("Plain Nonfat Greek Yogurt", LIB)?.id).toBe("ing-greek-yogurt-nonfat");
    expect(matchIngredient("All Purpose Flour", LIB)?.id).toBe("ing-ap-flour");
    expect(matchIngredient("Egg", LIB)?.id).toBe("ing-egg-whole");
  });
  it("maps the British 'yoghurt' spelling to the house yogurt", () => {
    expect(matchIngredient("fat free yoghurt", LIB)?.id).toBe("ing-greek-yogurt-nonfat");
  });
  it("never auto-matches a sweetener — they are a review-pass judgment (and never monk fruit)", () => {
    expect(matchIngredient("Granular Sugar Substitute (Swerve)", LIB)).toBeNull();
    expect(matchIngredient("granulated sweetener", LIB)).toBeNull(); // must NOT grab ing-monk-fruit-powdered
    expect(matchIngredient("powdered monk fruit", LIB)).toBeNull();
  });
  it("catches existing-ingredient phrasings the token fallback missed", () => {
    expect(matchIngredient("whole ripe bananas", LIB)?.id).toBe("ing-banana");
    expect(matchIngredient("cacao", LIB)?.id).toBe("ing-cocoa-powder");
    expect(matchIngredient("chocolate chunks", LIB)?.id).toBe("ing-chocolate-chips-semisweet");
    expect(matchIngredient("Confetti", LIB)?.id).toBe("ing-sprinkles");
    expect(matchIngredient("chopped nuts", LIB)?.id).toBe("ing-walnuts");
  });
});

describe("ingestMarkdown note-fallback", () => {
  it("recovers when the name is an adjective and the real ingredient is after 'or'", () => {
    const md = `# X
- **Servings** 2
## Ingredients
- 113 g Plain or Vanilla Nonfat Greek Yogurt
## Directions
**1.** Mix.`;
    const { draft } = ingestMarkdown(md, LIB);
    expect((draft.content.slots[0]!.resolution as { libraryIngredientId: string }).libraryIngredientId).toBe("ing-greek-yogurt-nonfat");
  });
});

describe("ingestMarkdown", () => {
  const md = `# Test Loaf
- **Servings** 4

A test.

## Ingredients
- 1 medium Egg
- 170 g Plain Nonfat Greek Yogurt
- 48 g Granular Sugar Substitute (Swerve)

## Directions
**1.** Mix everything.`;
  it("produces a create-shaped draft with matched ids, egg unit normalized, and an honest report", () => {
    const { draft, report } = ingestMarkdown(md, LIB);
    expect(draft.name).toBe("Test Loaf");
    expect(draft.yield).toEqual({ amount: 4, unit: "servings" });
    expect(draft.content.steps).toHaveLength(1);
    expect(draft.content.slots).toHaveLength(3);
    expect(draft.content.usages).toHaveLength(3);
    expect(draft.content.usages.every((u) => u.stepKey === draft.content.steps[0]!.componentKey)).toBe(true);
    const idOf = (i: number) => (draft.content.slots[i]!.resolution as { libraryIngredientId: string }).libraryIngredientId;
    const eggUsage = draft.content.usages.find((u) => u.slotKey === draft.content.slots[0]!.componentKey)!;
    expect(idOf(0)).toBe("ing-egg-whole");
    expect(eggUsage.quantityUnit).toBe("each"); // 'medium' normalized to each for eggs
    // the Swerve line is unresolved + carries a Splenda hint, not silently mapped
    expect(report.matched).toBe(2);
    expect(report.unresolved).toBe(1);
    const swerve = report.lines.find((l) => /Swerve/.test(l.name))!;
    expect(swerve.ingredientId).toBeUndefined();
    expect(swerve.hint).toMatch(/splenda/i);
  });
});
