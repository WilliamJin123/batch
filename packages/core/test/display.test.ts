import { describe, it, expect } from "vitest";
import { naturalCookUnit, formatCookQty, cookUnitLabel } from "../src/display.js";

describe("naturalCookUnit — derives the cook unit from grams, not the entered unit", () => {
  it("near-zero-density powder (granulated Splenda) → tablespoons, never raw grams", () => {
    // the original bug: 4 g of a 0.101 g/ml powder displayed as a meaningless '4 g'
    const q = naturalCookUnit(4, { densityGPerMl: 0.101 });
    expect(q).toEqual({ value: expect.closeTo(2.68, 1), unit: "tbsp" });
    expect(cookUnitLabel(4, { densityGPerMl: 0.101 })).toBe("2⅔ tbsp");
  });

  it("protein powder → scoops (a real ≥10 g scoop wins outright)", () => {
    expect(cookUnitLabel(44, { densityGPerMl: 0.1268, unitEquivalences: { scoop: 30 } })).toBe("1½ scoops");
    expect(cookUnitLabel(30, { unitEquivalences: { scoop: 30 } })).toBe("1 scoop");
  });

  it("ignores a bogus sub-10 g 'scoop' (vanilla extract) and uses its natural volume unit", () => {
    // vanilla has density 0.88 AND a 4.3 g 'scoop' data-quirk — must resolve to tsp, not '1.86 scoops'
    const label = cookUnitLabel(8, { densityGPerMl: 0.88, unitEquivalences: { scoop: 4.3, splash: 4.3 } });
    expect(label).toMatch(/tsp$/);
  });

  it("count-only ingredient (egg) → each", () => {
    expect(cookUnitLabel(50, { unitEquivalences: { each: 50, serving: 50 } })).toBe("1 each");
  });

  it("falls to a count unit only when no volume is readable (a pinch of salt)", () => {
    // tsp would be 0.07 (unreadable) → pinch wins
    expect(cookUnitLabel(0.4, { unitEquivalences: { pinch: 0.4, tsp: 6 } })).toBe("1 pinch");
  });

  it("packed-solid equivalences pick the largest readable unit", () => {
    expect(cookUnitLabel(35, { unitEquivalences: { tbsp: 13.75, cup: 220 } })).toBe("2½ tbsp"); // brown sugar
    expect(cookUnitLabel(40, { unitEquivalences: { cup: 125, tbsp: 7.8 } })).toBe("⅓ cup");      // flour
  });

  it("returns undefined when nothing is derivable → caller shows grams alone", () => {
    expect(naturalCookUnit(50, {})).toBeUndefined();
    expect(cookUnitLabel(50, { unitEquivalences: {} })).toBeUndefined();
    expect(naturalCookUnit(0, { densityGPerMl: 1 })).toBeUndefined();
  });
});

describe("formatCookQty — cook-readable fractions + pluralization", () => {
  it("rounds to nice fractions", () => {
    expect(formatCookQty({ value: 0.5, unit: "cup" })).toBe("½ cup");
    expect(formatCookQty({ value: 0.333, unit: "cup" })).toBe("⅓ cup");
    expect(formatCookQty({ value: 1.75, unit: "tsp" })).toBe("1¾ tsp");
  });
  it("rolls a near-whole fraction up to the integer", () => {
    expect(formatCookQty({ value: 0.98, unit: "tbsp" })).toBe("1 tbsp");
  });
  it("pluralizes word units by the displayed amount; abbreviations stay invariant", () => {
    expect(formatCookQty({ value: 2, unit: "scoop" })).toBe("2 scoops");
    expect(formatCookQty({ value: 1, unit: "scoop" })).toBe("1 scoop");
    expect(formatCookQty({ value: 1, unit: "each" })).toBe("1 each");
    expect(formatCookQty({ value: 2, unit: "tbsp" })).toBe("2 tbsp");
    expect(formatCookQty({ value: 2, unit: "cup" })).toBe("2 cups");
  });
});
