import { describe, it, expect } from "vitest";
import { normalizeForSearch, matchesSearch } from "./search";

describe("normalizeForSearch", () => {
  it("lowercases, strips accents, drops apostrophes, spaces other punctuation", () => {
    expect(normalizeForSearch("Lean S'mores Protein Brownie")).toBe("lean smores protein brownie");
    expect(normalizeForSearch("Crème Brûlée")).toBe("creme brulee");
    expect(normalizeForSearch("No-Bake  Bar")).toBe("no bake bar");
    expect(normalizeForSearch("   ")).toBe("");
  });
});

describe("matchesSearch", () => {
  const node = ["Lean S'mores Protein Brownie", "Protein Bars", ["brownie", "smores", "no-bake"]].flat();

  it("matches anywhere in the name, not just a prefix", () => {
    expect(matchesSearch(node, "brownie")).toBe(true);   // mid-name
    expect(matchesSearch(node, "protein")).toBe(true);
    expect(matchesSearch(node, "lean")).toBe(true);      // prefix still works
  });

  it("matches across the apostrophe — the bug: 'smores' finds \"S'mores\"", () => {
    expect(matchesSearch(["Lean S'mores Protein Brownie"], "smores")).toBe(true);
    expect(matchesSearch(["Lean S'mores Protein Brownie"], "s'mores")).toBe(true);
  });

  it("is accent-insensitive", () => {
    expect(matchesSearch(["Crème Brûlée Protein Cheesecake"], "creme brulee")).toBe(true);
  });

  it("matches family and tags too", () => {
    expect(matchesSearch(["X", "Cakes", ["funfetti"]].flat(), "cake")).toBe(true);
    expect(matchesSearch(["X", "Singles", ["high-protein"]].flat(), "high protein")).toBe(true); // hyphen tag vs spaced query
  });

  it("empty query matches everything; non-match returns false", () => {
    expect(matchesSearch(["anything"], "")).toBe(true);
    expect(matchesSearch(["anything"], "   ")).toBe(true);
    expect(matchesSearch(["Lemon Bar"], "smores")).toBe(false);
  });
});
