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

  it("renders a version's notes (pitfalls/techniques) under a notes heading", () => {
    const txt = renderHuman({
      name: "Cheesecake", id: "abcdef120000", status: "approved", yield: { amount: 8, unit: "slices" },
      content: {
        steps: [{ componentKey: "s1", order: 1, instructionText: "Bake" }],
        slots: [], usages: [],
        notes: [
          { componentKey: "n1", kind: "pitfall", text: "don't overbake", stepKey: "s1" },
          { componentKey: "n2", kind: "technique", text: "room-temp the cream cheese" },
        ],
      },
    });
    expect(txt).toMatch(/notes:/);
    expect(txt).toMatch(/pitfall \[s1\]: don't overbake/);
    expect(txt).toMatch(/technique: room-temp the cream cheese/);
  });

  it("prints strings (export cards) verbatim", () => {
    expect(renderHuman("# Card\n\n1. step")).toBe("# Card\n\n1. step");
  });

  it("falls back to pretty JSON for unknown shapes", () => {
    expect(renderHuman({ weird: 1 })).toBe(JSON.stringify({ weird: 1 }, null, 2));
  });
});
