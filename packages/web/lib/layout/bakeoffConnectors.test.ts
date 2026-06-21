import { it, expect } from "vitest";
import { buildConnectors } from "./bakeoffConnectors";

const note = (n: number) => ({
  arms: Array.from({ length: n }, (_, i) => ({ recipeId: "r" + i, name: "R" + i, cal: 0, calPerGramProtein: null, servings: 1, label: "ABC"[i] })),
  differingIngredients: [],
});

it("two side-by-side arms → a pair connector (two anchors, no spine, pill at the midpoint of the facing edges)", () => {
  const pos = new Map<string, any>([
    ["a", { x: 0, y: 0, w: 200, h: 100 }],
    ["b", { x: 400, y: 0, w: 200, h: 100 }],
  ]);
  const [c] = buildConnectors([{ arms: ["a", "b"], note: note(2) } as any], pos);
  expect(c.anchors.length).toBe(2);
  expect(c.spine).toBeUndefined();
  // right edge of A (x=200) ↔ left edge of B (x=400) at mid-height; pill midway
  expect(c.mx).toBe(300);
  expect(c.my).toBe(50);
});

it("three arms in a row → a comb connector (three anchors + a spine floating above, pill centred on the spine)", () => {
  const pos = new Map<string, any>([
    ["a", { x: 0, y: 100, w: 200, h: 100 }],
    ["b", { x: 300, y: 100, w: 200, h: 100 }],
    ["c", { x: 600, y: 100, w: 200, h: 100 }],
  ]);
  const [c] = buildConnectors([{ arms: ["a", "b", "c"], note: note(3) } as any], pos);
  expect(c.anchors.length).toBe(3);
  expect(c.spine).toBeDefined();
  expect(c.my).toBeLessThan(100);        // spine floats above the arm tops (y=100)
  expect(c.spine!.y1).toBe(c.my);
  expect(c.mx).toBe(400);                // arm centres 100/400/700 → mid 400
  expect(c.spine!.x1).toBe(100);         // spine spans the outer arm centres
  expect(c.spine!.x2).toBe(700);
});

it("skips a bake-off whose arms aren't laid out yet", () => {
  expect(buildConnectors([{ arms: ["x", "y"], note: note(2) } as any], new Map())).toEqual([]);
});
