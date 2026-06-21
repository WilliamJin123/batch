import { describe, it, expect } from "vitest";
import { classifyKinds } from "../src/kinds.js";
import type { RecipeVersion } from "../src/types.js";

function v(p: Partial<RecipeVersion> & { id: string; recipeId: string }): RecipeVersion {
  return {
    name: p.name ?? p.recipeId, tags: p.tags ?? [], yield: { amount: 1, unit: "batch" },
    status: "draft", author: "user", commitMessage: "", content: { steps: [], slots: [], usages: [] },
    createdAt: "2026-01-01T00:00:00.000Z", ...p,
  };
}

describe("classifyKinds", () => {
  it("a root that another head derives from is a base; the deriver is a variant", () => {
    const heads = [
      v({ id: "vBase", recipeId: "rBase" }),
      v({ id: "vVar", recipeId: "rVar", derivesFromVersionId: "vBase" }),
    ];
    const recipeIdOf = new Map(heads.map((h) => [h.id, h.recipeId]));
    const k = classifyKinds(heads, recipeIdOf);
    expect(k.get("rBase")).toBe("base");
    expect(k.get("rVar")).toBe("variant");
  });

  it("a standalone root with no variants is a root", () => {
    const heads = [v({ id: "v1", recipeId: "r1" })];
    const k = classifyKinds(heads, new Map([["v1", "r1"]]));
    expect(k.get("r1")).toBe("root");
  });

  it("a sub-recipe tag wins over everything", () => {
    const heads = [v({ id: "v1", recipeId: "r1", tags: ["sub-recipe"] })];
    const k = classifyKinds(heads, new Map([["v1", "r1"]]));
    expect(k.get("r1")).toBe("sub-recipe");
  });

  it("an explicit 'base' tag marks a base even with no variants yet", () => {
    const heads = [v({ id: "v1", recipeId: "r1", tags: ["base"] })];
    const k = classifyKinds(heads, new Map([["v1", "r1"]]));
    expect(k.get("r1")).toBe("base");
  });

  it("resolves a base whose derived version points at a non-head (old) base version", () => {
    // variant pins an OLD base version id; the map still resolves it to the base recipe
    const heads = [
      v({ id: "vBaseHead", recipeId: "rBase" }),
      v({ id: "vVar", recipeId: "rVar", derivesFromVersionId: "vBaseOld" }),
    ];
    const recipeIdOf = new Map([["vBaseHead", "rBase"], ["vBaseOld", "rBase"], ["vVar", "rVar"]]);
    const k = classifyKinds(heads, recipeIdOf);
    expect(k.get("rBase")).toBe("base");
  });
});
