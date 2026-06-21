import { describe, it, expect } from "vitest";
import { layoutGraph } from "./graphLayout";

const g = { nodes: [
  { recipeId: "base", kind: "base", name: "Base Cookie" }, { recipeId: "v1", kind: "variant", name: "Variant One" }, { recipeId: "sub", kind: "sub-recipe", name: "Frosting" },
] as any, edges: [ { from: "v1", to: "base", rel: "derives" }, { from: "v1", to: "sub", rel: "composes" } ] as any };

it("places every node with finite coords, deterministically", () => {
  const a = layoutGraph(g); const b = layoutGraph(g);
  expect(a.size).toBe(3);
  for (const p of a.values()) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
  expect([...a.entries()]).toEqual([...b.entries()]);
});

it("co-locates N bake-off arms in a row and reserves a top band above them for the bracket", () => {
  const g3 = {
    nodes: [
      { recipeId: "loaf", kind: "root", name: "Carrot Cake Loaf", servings: 16 },
      { recipeId: "cake", kind: "root", name: "Protein Carrot Cake", servings: 6 },
      { recipeId: "bars", kind: "root", name: "Carrot Cake Protein Bars", servings: 9 },
      { recipeId: "other", kind: "root", name: "Unrelated Cookie", servings: 12 },
    ] as any,
    edges: [] as any,
    bakeoffs: [{ arms: ["loaf", "cake", "bars"], note: { arms: [], differingIngredients: [] } }] as any,
  };
  const pos = layoutGraph(g3);
  const loaf = pos.get("loaf")!, cake = pos.get("cake")!, bars = pos.get("bars")!, other = pos.get("other")!;
  for (const p of [loaf, cake, bars, other]) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }

  // arms laid out as a row: spread horizontally, centres roughly aligned vertically
  const xs = [loaf.x, cake.x, bars.x];
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100); // genuinely side-by-side, not stacked
  const cy = (p: typeof loaf) => p.y + p.h / 2;
  expect(Math.max(cy(loaf), cy(cake), cy(bars)) - Math.min(cy(loaf), cy(cake), cy(bars))).toBeLessThan(40);

  // a band is reserved ABOVE the arms for the spine + pill. The arm cluster is the tallest here, so
  // shelf-packing seats it at origin y≈0 — without the reserved band the arms would sit at y≈0, so a
  // topmost-arm y past the band height is the band doing its job.
  const minArmY = Math.min(loaf.y, cake.y, bars.y);
  expect(minArmY).toBeGreaterThanOrEqual(40);
});
