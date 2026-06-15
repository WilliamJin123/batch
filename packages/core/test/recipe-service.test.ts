import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../src/in-memory-repository.js";
import type { Recipe } from "../src/types.js";

describe("InMemoryRepository", () => {
  it("stores and retrieves a recipe and updates head", async () => {
    const repo = new InMemoryRepository();
    const recipe: Recipe = {
      id: "r1",
      createdBy: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      headVersionId: "v1",
    };
    await repo.saveRecipe(recipe);
    await repo.setHead("r1", "v2");
    const got = await repo.getRecipe("r1");
    expect(got?.headVersionId).toBe("v2");
  });

  it("stores and lists library ingredients", async () => {
    const repo = new InMemoryRepository();
    await repo.saveIngredient({
      id: "ing-x", name: "x", macrosPer100g: { calories: 1, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    });
    expect((await repo.getIngredient("ing-x"))?.name).toBe("x");
    expect(await repo.listIngredients()).toHaveLength(1);
  });

  it("stores, lists, and deletes feedback entries", async () => {
    const repo = new InMemoryRepository();
    await repo.saveFeedback({
      kind: "made", id: "f1", recipeId: "r1", versionId: "v1", rating: "good",
      date: "2026-06-01", author: "user", createdAt: "2026-06-01T00:00:00.000Z",
    });
    expect((await repo.getFeedback("f1"))?.kind).toBe("made");
    expect(await repo.listFeedback()).toHaveLength(1);
    await repo.deleteFeedback("f1");
    expect(await repo.getFeedback("f1")).toBeUndefined();
    expect(await repo.listFeedback()).toEqual([]);
  });
});

import { RecipeService } from "../src/recipe-service.js";
import { testDeps } from "../src/deps.js";
import type { RecipeContent } from "../src/types.js";
import { computeMacros } from "../src/compute-macros.js";

function content(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "Mix and bake", temperature: 350 }],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}

function makeService() {
  return new RecipeService(new InMemoryRepository(), testDeps());
}

describe("createRecipe", () => {
  it("creates a root recipe + first version and points head at it", async () => {
    const svc = makeService();
    const { recipe, version } = await svc.createRecipe({
      name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    expect(recipe.headVersionId).toBe(version.id);
    expect(version.derivesFromVersionId).toBeUndefined();
    expect(version.status).toBe("draft");
    expect(version.author).toBe("user");
    expect(await svc.resolve(version.id)).toEqual(content());
  });
});

describe("deriveVariant", () => {
  it("creates a new recipe whose first version derives from the base and resolves identically", async () => {
    const svc = makeService();
    const { version: base } = await svc.createRecipe({
      name: "Cheesecake Base", yield: { amount: 12, unit: "slices" }, content: content(),
    });
    const { recipe: variantRecipe, version: variant } = await svc.deriveVariant({
      baseVersionId: base.id, name: "Banana Cheesecake",
    });
    expect(variant.derivesFromVersionId).toBe(base.id);
    expect(variant.recipeId).toBe(variantRecipe.id);
    expect(variant.recipeId).not.toBe(base.recipeId);
    expect(variant.name).toBe("Banana Cheesecake");
    expect(variant.overrideSet).toEqual({ entries: [], name: "Banana Cheesecake" });
    // empty overrides => content identical to base
    expect(await svc.resolve(variant.id)).toEqual(content());
  });
});

describe("applyOverride", () => {
  it("pins the overridden component but inherits the rest, as a new version", async () => {
    const svc = makeService();
    const { version: base } = await svc.createRecipe({
      name: "Base", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    const { version: variant } = await svc.deriveVariant({ baseVersionId: base.id, name: "Low-sugar" });

    const { version: v2 } = await svc.applyOverride({
      versionId: variant.id,
      entry: { op: "replace", kind: "usage", target: "u1",
        payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } },
      commitMessage: "cut sugar 200g -> 120g",
    });

    expect(v2.prevVersionId).toBe(variant.id); // history edge
    expect(v2.derivesFromVersionId).toBe(base.id); // still derives from base
    const resolved = await svc.resolve(v2.id);
    expect(resolved.usages[0]?.quantityValue).toBe(120); // overridden
    expect(resolved.steps[0]?.instructionText).toBe("Mix and bake"); // inherited
  });

  it("applies an override directly to a root (base) version as a new root version", async () => {
    const svc = makeService();
    const { version: root } = await svc.createRecipe({
      name: "Root", yield: { amount: 1, unit: "loaf" }, content: content(),
    });
    const { version: v2 } = await svc.applyOverride({
      versionId: root.id,
      entry: { op: "replace", kind: "usage", target: "u1",
        payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 180, quantityUnit: "g" } },
      commitMessage: "tune base sugar 200 -> 180",
    });
    expect(v2.prevVersionId).toBe(root.id); // history edge
    expect(v2.derivesFromVersionId).toBeUndefined(); // still a root, not a variant
    expect(v2.overrideSet).toBeUndefined(); // a root stores full content, not a delta
    expect((await svc.resolve(v2.id)).usages[0]?.quantityValue).toBe(180); // change baked in
    expect((await svc.resolve(root.id)).usages[0]?.quantityValue).toBe(200); // original version immutable
  });
});

describe("editMetadata + getHistory", () => {
  it("creates a new version with updated metadata, content unchanged", async () => {
    const svc = makeService();
    const { version: v1 } = await svc.createRecipe({
      name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    const { version: v2 } = await svc.editMetadata({
      versionId: v1.id, patch: { name: "Fudgy Brownies", status: "approved", tags: ["dessert", "brownie"] },
    });
    expect(v2.prevVersionId).toBe(v1.id);
    expect(v2.name).toBe("Fudgy Brownies");
    expect(v2.status).toBe("approved");
    expect(v2.tags).toEqual(["dessert", "brownie"]);
    expect(v2.content).toEqual(v1.content);
  });

  it("walks the history chain newest-first", async () => {
    const svc = makeService();
    const { version: v1 } = await svc.createRecipe({
      name: "A", yield: { amount: 1, unit: "x" }, content: content(),
    });
    const { version: v2 } = await svc.editMetadata({ versionId: v1.id, patch: { name: "B" } });
    const { version: v3 } = await svc.editMetadata({ versionId: v2.id, patch: { name: "C" } });
    const history = await svc.getHistory(v3.id);
    expect(history.map((v) => v.name)).toEqual(["C", "B", "A"]);
  });
});

describe("enumeration", () => {
  it("lists recipes and versions, and getRecipe returns the recipe", async () => {
    const svc = makeService();
    const { recipe: r1, version: v1 } = await svc.createRecipe({
      name: "Base", yield: { amount: 12, unit: "slices" }, content: content(),
    });
    await svc.deriveVariant({ baseVersionId: v1.id, name: "Variant" });
    const recipes = await svc.listRecipes();
    const versions = await svc.listVersions();
    expect(recipes).toHaveLength(2);
    expect(versions).toHaveLength(2);
    expect((await svc.getRecipe(r1.id)).id).toBe(r1.id);
  });
});

describe("macros", () => {
  const sugar = {
    id: "ing-sugar", name: "sugar",
    macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 },
  };

  it("snapshots partial macros on create, then completes them via recompute once the ingredient is added", async () => {
    const svc = makeService();
    const { version: v1 } = await svc.createRecipe({
      name: "Base", yield: { amount: 2, unit: "servings" }, content: content(),
    });
    // ing-sugar isn't in the library yet → partial, nothing summed
    expect(v1.macros?.basis).toBe("partial");
    expect(v1.macros?.total.calories).toBe(0);

    await svc.addIngredient(sugar);
    const { version: v2 } = await svc.recomputeMacros({ versionId: v1.id });
    expect(v2.prevVersionId).toBe(v1.id);
    expect(v2.author).toBe("system");
    expect(v2.macros?.basis).toBe("complete");
    expect(v2.macros?.total.calories).toBe(774); // 200 g sugar
    expect(v2.macros?.perServing.calories).toBe(387); // ÷ 2 servings
  });

  it("recompute is idempotent when nothing changed (returns the same version)", async () => {
    const svc = makeService();
    await svc.addIngredient(sugar);
    const { version: v1 } = await svc.createRecipe({
      name: "Base", yield: { amount: 2, unit: "servings" }, content: content(),
    });
    expect(v1.macros?.basis).toBe("complete");
    const { version: same } = await svc.recomputeMacros({ versionId: v1.id });
    expect(same.id).toBe(v1.id);
  });
});

describe("composition (M3)", () => {
  const flour = { id: "ing-flour", name: "flour", macrosPer100g: { calories: 364, protein: 10, carbs: 76, fat: 1, fiber: 2.7 } };
  const cream = { id: "ing-cream", name: "cream cheese", macrosPer100g: { calories: 233, protein: 6, carbs: 8, fat: 19, fiber: 0 } };

  function frostingContent(): RecipeContent {
    return {
      steps: [{ componentKey: "beat", order: 1, instructionText: "Beat smooth" }],
      slots: [{ componentKey: "cc", name: "cream cheese", resolution: { kind: "raw", libraryIngredientId: "ing-cream" } }],
      usages: [{ componentKey: "u-cc", stepKey: "beat", slotKey: "cc", quantityValue: 100, quantityUnit: "g" }],
    };
  }
  function cookieContent(frostKey: string): RecipeContent {
    return {
      steps: [
        { componentKey: "mix", order: 1, instructionText: "Mix" },
        { componentKey: "frost", order: 2, instructionText: "Frost" },
      ],
      slots: [
        { componentKey: "flour", name: "flour", resolution: { kind: "raw", libraryIngredientId: "ing-flour" } },
        { componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: frostKey } },
      ],
      usages: [
        { componentKey: "u-flour", stepKey: "mix", slotKey: "flour", quantityValue: 100, quantityUnit: "g" },
        { componentKey: "u-frost", stepKey: "frost", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" },
      ],
    };
  }
  async function setup() {
    const svc = makeService();
    await svc.addIngredient(flour);
    await svc.addIngredient(cream);
    const { version: frost } = await svc.createRecipe({
      name: "Cream Cheese Frosting", yield: { amount: 1, unit: "batch" }, content: frostingContent(),
    });
    const { version: cookie } = await svc.createRecipe({
      name: "Cookie", yield: { amount: 5, unit: "cookies" }, content: cookieContent(frost.id),
    });
    return { svc, frost, cookie };
  }

  it("rolls a sub-recipe's macros up into the parent", async () => {
    const { cookie } = await setup();
    expect(cookie.macros?.basis).toBe("complete");
    expect(cookie.macros?.total.calories).toBe(597); // 100 g flour (364) + 1 batch frosting (233)
  });

  it("flattens the composed recipe so the frosting reads inline, with provenance", async () => {
    const { svc, cookie } = await setup();
    const { content, sources } = await svc.flatten(cookie.id);
    expect(content.slots.some((s) => s.resolution.kind === "sub_recipe")).toBe(false);
    expect(content.usages.find((u) => u.slotKey === "frosting/cc")?.quantityValue).toBe(100);
    expect(sources[0]?.recipeName).toBe("Cream Cheese Frosting");
    expect(sources[0]?.behind).toBe(0);
  });

  it("macros are invariant to flattening (rollup == flattened, within rounding)", async () => {
    const { svc, cookie } = await setup();
    const { content } = await svc.flatten(cookie.id);
    const flatSnap = computeMacros(content, cookie.yield, new Map([["ing-flour", flour], ["ing-cream", cream]]));
    expect(Math.abs(flatSnap.total.calories - cookie.macros!.total.calories)).toBeLessThanOrEqual(0.01);
  });

  it("counts staleness after the child advances, and rejects a composition cycle", async () => {
    const { svc, frost, cookie } = await setup();
    expect(await svc.staleness(frost.id)).toBe(0);
    await svc.editMetadata({ versionId: frost.id, patch: { name: "Cream Cheese Frosting v2" } });
    expect(await svc.staleness(frost.id)).toBe(1);
    await expect(svc.applyOverride({
      versionId: frost.id,
      entry: { op: "add", kind: "slot", payload: { componentKey: "loop", name: "loop", resolution: { kind: "sub_recipe", subRecipeVersionId: cookie.id } } },
    })).rejects.toThrow(/cycle/);
  });

  it("reports -1 staleness for a pin on a diverged (non-head) branch", async () => {
    const svc = makeService();
    const { version: v1 } = await svc.createRecipe({
      name: "Base", yield: { amount: 1, unit: "batch" },
      content: { steps: [{ componentKey: "s", order: 1, instructionText: "do" }], slots: [], usages: [] },
    });
    // Fork v1 twice → v2 (abandoned) and v3 (new head); v2 is no longer on the head's prev-chain.
    const { version: v2 } = await svc.editMetadata({ versionId: v1.id, patch: { name: "branch A" } });
    await svc.editMetadata({ versionId: v1.id, patch: { name: "branch B" } });
    expect(await svc.staleness(v1.id)).toBe(1);   // still on the head chain (head → v1)
    expect(await svc.staleness(v2.id)).toBe(-1);  // diverged branch, not on the head's history
  });
});

describe("addFeedback / deleteFeedback", () => {
  it("appends an entry pinned to the version, resolves recipeId, and writes NO new version", async () => {
    const svc = makeService();
    const { recipe, version } = await svc.createRecipe({
      name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    const before = (await svc.listVersions()).length;
    const fb = await svc.addFeedback({ versionId: version.id, kind: "made", rating: "good", notes: "tasty" });
    expect(fb.recipeId).toBe(recipe.id);
    expect(fb.versionId).toBe(version.id);
    expect(fb.kind).toBe("made");
    expect((await svc.listVersions()).length).toBe(before);                 // no version churn (DF-6)
    expect((await svc.getRecipe(recipe.id)).headVersionId).toBe(version.id); // head unmoved
  });
  it("rejects feedback on an unknown version", async () => {
    const svc = makeService();
    await expect(svc.addFeedback({ versionId: "nope", kind: "to-make" })).rejects.toThrow(/version not found/);
  });
  it("deleteFeedback removes the one entry", async () => {
    const svc = makeService();
    const { version } = await svc.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const fb = await svc.addFeedback({ versionId: version.id, kind: "to-make" });
    await svc.deleteFeedback(fb.id);
    expect(await svc.feedbackForVersion(version.id)).toEqual([]);
  });
});
