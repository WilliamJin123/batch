import { describe, it, expect } from "vitest";
import { buildQueue } from "./queue";
import type { TreeNodeVM } from "./types";

// minimal node factory — buildQueue only reads a handful of fields
const node = (over: Partial<TreeNodeVM>): TreeNodeVM => ({
  recipeId: "id", versionId: "v", name: "X", tags: [], kind: "root", family: "Singles",
  cal: 200, protein: 20, carbs: 10, fat: 5, wholeCal: 1800, wholeProtein: 180,
  calPerGramProtein: 10, servings: 9, servingUnit: "servings",
  made: false, queued: false, needsTuning: false, ...over,
} as TreeNodeVM);

describe("buildQueue", () => {
  it("puts queued recipes in makeNext, split by bake vs no-bake", () => {
    const q = buildQueue([
      node({ recipeId: "a", name: "Baked Bar", tags: ["bars"], queued: true }),
      node({ recipeId: "b", name: "No-Bake Bar", tags: ["bars", "no-bake"], queued: true }),
      node({ recipeId: "c", name: "Made Thing", made: true, rating: "good", queued: false }),
    ]);
    expect(q.makeNext.bake.map((i) => i.recipeId)).toEqual(["a"]);
    expect(q.makeNext.noBake.map((i) => i.recipeId)).toEqual(["b"]);
  });

  it("orders each group produce-first (apple, carrot, lemon…) then leanest ratio", () => {
    const q = buildQueue([
      node({ recipeId: "lean", name: "Lean Thing", tags: ["bars"], queued: true, calPerGramProtein: 5 }),
      node({ recipeId: "apple", name: "Apple Bar", tags: ["bars"], queued: true, calPerGramProtein: 20 }),
      node({ recipeId: "carrot", name: "Carrot Bar", tags: ["bars"], queued: true, calPerGramProtein: 18 }),
      node({ recipeId: "lemon", name: "Lemon Bar", tags: ["bars"], queued: true, calPerGramProtein: 19 }),
    ]);
    // apple < carrot < lemon (apple pulled to the front per the user), then the leaner non-produce
    expect(q.makeNext.bake.map((i) => i.recipeId)).toEqual(["apple", "carrot", "lemon", "lean"]);
  });

  it("breaks produce ties by leanest ratio (ascending; null ratio last)", () => {
    const q = buildQueue([
      node({ recipeId: "hi", name: "Carrot A", tags: ["bars"], queued: true, calPerGramProtein: 15 }),
      node({ recipeId: "lo", name: "Carrot B", tags: ["bars"], queued: true, calPerGramProtein: 9 }),
      node({ recipeId: "none", name: "Carrot C", tags: ["bars"], queued: true, calPerGramProtein: null }),
    ]);
    expect(q.makeNext.bake.map((i) => i.recipeId)).toEqual(["lo", "hi", "none"]);
  });

  it("puts only made-excellent recipes in makeAgain, split by bake vs no-bake", () => {
    const q = buildQueue([
      node({ recipeId: "x", name: "Excellent Cake", tags: ["cake"], made: true, rating: "excellent" }),
      node({ recipeId: "n", name: "Excellent Nanaimo", tags: ["bars", "no-bake"], made: true, rating: "excellent" }),
      node({ recipeId: "g", name: "Good Cake", tags: ["cake"], made: true, rating: "good" }),
      node({ recipeId: "q", name: "Queued", tags: ["cake"], queued: true }),
    ]);
    expect(q.makeAgain.bake.map((i) => i.recipeId)).toEqual(["x"]);
    expect(q.makeAgain.noBake.map((i) => i.recipeId)).toEqual(["n"]);
    // an excellent is not also a "make next" unless it's explicitly queued
    expect(q.makeNext.bake.map((i) => i.recipeId)).toEqual(["q"]);
  });

  it("excludes sub-recipes (components, not standalone makes)", () => {
    const q = buildQueue([
      node({ recipeId: "sub", name: "Frosting", tags: ["frosting", "sub-recipe"], kind: "sub-recipe", queued: true }),
    ]);
    expect(q.makeNext.bake).toHaveLength(0);
    expect(q.makeNext.noBake).toHaveLength(0);
  });

  it("excludes rejected (superseded) recipes from both lanes, even if still queued", () => {
    const q = buildQueue([
      node({ recipeId: "old", name: "Superseded Bar", tags: ["bars"], queued: true, status: "rejected" }),
      node({ recipeId: "new", name: "Live Bar", tags: ["bars"], queued: true, status: "draft" }),
      node({ recipeId: "ex", name: "Rejected Excellent", tags: ["bars"], made: true, rating: "excellent", status: "rejected" }),
    ]);
    expect(q.makeNext.bake.map((i) => i.recipeId)).toEqual(["new"]); // the rejected one is gone
    expect(q.makeAgain.bake).toHaveLength(0);                         // rejected stays out of make-again too
  });

  it("tags each item with its no-bake flag and produce keyword", () => {
    const q = buildQueue([node({ recipeId: "c", name: "Carrot No-Bake", tags: ["bars", "no-bake"], queued: true })]);
    const item = q.makeNext.noBake[0]!;
    expect(item.noBake).toBe(true);
    expect(item.produce).toBe("carrot");
  });

  it("matches produce at a word boundary — 'Pineapple' is not the perishable 'apple'", () => {
    const q = buildQueue([
      node({ recipeId: "pine", name: "Pineapple Upside-Down Cake", tags: ["cake"], queued: true, calPerGramProtein: 30 }),
      node({ recipeId: "apple", name: "Apple Fritter", tags: ["apple"], queued: true, calPerGramProtein: 12 }),
    ]);
    const items = q.makeNext.bake;
    expect(items.find((i) => i.recipeId === "pine")?.produce).toBe(null);
    expect(items.find((i) => i.recipeId === "apple")?.produce).toBe("apple");
    // and the real apple recipe still sorts ahead of the (non-produce) pineapple one
    expect(items.map((i) => i.recipeId)).toEqual(["apple", "pine"]);
  });
});
