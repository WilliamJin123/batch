import { describe, it, expect } from "vitest";
import { toGrams, normalizeUnit } from "../src/units.js";

describe("normalizeUnit", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeUnit("  Fl  OZ ")).toBe("fl oz");
  });
});

describe("toGrams", () => {
  it("converts mass units via the universal table (ingredient-independent)", () => {
    expect(toGrams(2, "kg", {})).toEqual({ grams: 2000 });
    expect(toGrams(100, "g", {})).toEqual({ grams: 100 });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(toGrams(1, " KG ", {})).toEqual({ grams: 1000 });
  });

  it("converts volume units via the ingredient's density (the volume↔mass bridge)", () => {
    const r = toGrams(1, "cup", { densityGPerMl: 1 }); // water ≈ 1 g/ml
    expect("grams" in r && Math.abs(r.grams - 236.588) < 0.01).toBe(true);
  });

  it("reports a reason when a volume unit has no density", () => {
    expect("reason" in toGrams(1, "cup", {})).toBe(true);
  });

  it("prefers explicit unitEquivalences over the universal tables", () => {
    expect(toGrams(3, "each", { unitEquivalences: { each: 50 } })).toEqual({ grams: 150 }); // 3 eggs
    // a packed solid: 1 cup = 120 g overrides the volumetric path
    expect(toGrams(1, "cup", { densityGPerMl: 1, unitEquivalences: { cup: 120 } })).toEqual({ grams: 120 });
  });

  it("reports a reason for an unknown unit", () => {
    expect("reason" in toGrams(1, "pinch", {})).toBe(true);
  });
});
