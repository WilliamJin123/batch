import { describe, it, expect } from "vitest";
import { renderHuman } from "../src/format.js";

describe("renderHuman", () => {
  it("renders a macro snapshot with the cal/g-protein ratio", () => {
    const txt = renderHuman({
      total: { calories: 1721.9, protein: 150.9, carbs: 140.8, fat: 61, fiber: 14.7 },
      perServing: { calories: 215.2, protein: 18.9, carbs: 17.6, fat: 7.6, fiber: 1.8 },
      yield: { amount: 8, unit: "slices" }, basis: "complete", unresolved: [], lines: [],
      caloriesPerGramProtein: 11.41,
    });
    expect(txt).toMatch(/per slice/);
    expect(txt).toMatch(/11\.4 cal\/g protein/);
  });

  it("renders a recipe list as an aligned table with markers", () => {
    const txt = renderHuman([
      {
        recipeId: "r1", headVersionId: "abcdef12-0000", name: "Turtle", status: "draft",
        tags: ["cheesecake"], isVariant: true, kcalPerServing: 215, tried: false, queued: true,
      },
    ]);
    expect(txt).toMatch(/Turtle/);
    expect(txt).toMatch(/abcdef12/);
    expect(txt).toMatch(/to-make/);
  });

  it("prints strings (export cards) verbatim", () => {
    expect(renderHuman("# Card\n\n1. step")).toBe("# Card\n\n1. step");
  });

  it("falls back to pretty JSON for unknown shapes", () => {
    expect(renderHuman({ weird: 1 })).toBe(JSON.stringify({ weird: 1 }, null, 2));
  });
});
