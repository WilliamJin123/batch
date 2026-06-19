import { describe, it, expect } from "vitest";
import { layoutGraph } from "./graphLayout";

const g = { nodes: [
  { recipeId: "base", kind: "base" }, { recipeId: "v1", kind: "variant" }, { recipeId: "sub", kind: "sub-recipe" },
] as any, edges: [ { from: "v1", to: "base", rel: "derives" }, { from: "v1", to: "sub", rel: "composes" } ] as any };

it("places every node with finite coords, deterministically", () => {
  const a = layoutGraph(g); const b = layoutGraph(g);
  expect(a.size).toBe(3);
  for (const p of a.values()) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
  expect([...a.entries()]).toEqual([...b.entries()]);
});
