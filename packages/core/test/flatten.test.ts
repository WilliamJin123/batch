import { describe, it, expect } from "vitest";
import { flattenContent } from "../src/flatten.js";
import type { RecipeContent, Yield } from "../src/types.js";

function cookie(): RecipeContent {
  return {
    steps: [
      { componentKey: "mix", order: 1, instructionText: "Mix dough" },
      { componentKey: "frost", order: 2, instructionText: "Frost" },
    ],
    slots: [
      { componentKey: "flour", name: "flour", resolution: { kind: "raw", libraryIngredientId: "ing-flour" } },
      { componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: "v-frost" } },
    ],
    usages: [
      { componentKey: "u-flour", stepKey: "mix", slotKey: "flour", quantityValue: 100, quantityUnit: "g" },
      { componentKey: "u-frost", stepKey: "frost", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" },
    ],
  };
}
const frosting: RecipeContent = {
  steps: [{ componentKey: "beat", order: 1, instructionText: "Beat smooth" }],
  slots: [{ componentKey: "cc", name: "cream cheese", resolution: { kind: "raw", libraryIngredientId: "ing-cc" } }],
  usages: [{ componentKey: "u-cc", stepKey: "beat", slotKey: "cc", quantityValue: 150, quantityUnit: "g" }],
};
const subs = new Map([["v-frost", {
  content: frosting, yield: { amount: 1, unit: "batch" } as Yield, totalGrams: 150, name: "Cream Cheese Frosting",
}]]);

describe("flattenContent", () => {
  it("replaces the sub_recipe slot with the child's steps + ingredients, sectioned under its name", () => {
    const flat = flattenContent(cookie(), subs);
    expect(flat.slots.some((s) => s.resolution.kind === "sub_recipe")).toBe(false);
    expect(flat.slots.some((s) => s.componentKey === "frosting/cc")).toBe(true);
    expect(flat.steps.find((s) => s.componentKey === "frosting/beat")?.section).toBe("Cream Cheese Frosting");
    expect(flat.usages.find((u) => u.slotKey === "frosting/cc")?.quantityValue).toBe(150); // whole batch
    expect(flat.usages.find((u) => u.slotKey === "flour")?.quantityValue).toBe(100);        // parent untouched
  });

  it("scales the child's quantities by the usage fraction (half a batch)", () => {
    const half = cookie();
    half.usages[1]!.quantityValue = 0.5;
    const flat = flattenContent(half, subs);
    expect(flat.usages.find((u) => u.slotKey === "frosting/cc")?.quantityValue).toBe(75);
  });

  it("carries notes through, prefixing sub-recipe note keys + anchors and keeping parent notes", () => {
    const c: RecipeContent = { ...cookie(), notes: [{ componentKey: "n1", kind: "pitfall", text: "don't overmix", stepKey: "mix" }] };
    const fr: RecipeContent = { ...frosting, notes: [{ componentKey: "nf", kind: "technique", text: "beat cold", stepKey: "beat" }] };
    const subWithNote = new Map([["v-frost", {
      content: fr, yield: { amount: 1, unit: "batch" } as Yield, totalGrams: 150, name: "Cream Cheese Frosting",
    }]]);
    const flat = flattenContent(c, subWithNote);
    expect(flat.notes?.find((nt) => nt.componentKey === "n1")?.text).toBe("don't overmix"); // parent note kept
    const childNote = flat.notes?.find((nt) => nt.componentKey === "frosting/nf");
    expect(childNote?.stepKey).toBe("frosting/beat"); // child note key + anchor prefixed
  });
});
