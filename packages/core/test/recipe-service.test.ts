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

describe("feedbackSummary rollup", () => {
  it("rolls up per recipe; derivation isolates tried (distinct recipeId)", async () => {
    const svc = makeService();
    const { recipe: rBase, version: base } = await svc.createRecipe({
      name: "Base", yield: { amount: 1, unit: "x" }, content: content(),
    });
    const { recipe: rVar } = await svc.deriveVariant({ baseVersionId: base.id, name: "Variant" });
    await svc.addFeedback({ versionId: base.id, kind: "made", rating: "good" });
    const summary = await svc.feedbackSummary();
    expect(summary[rBase.id]).toEqual({ tried: true, queued: false, verdict: "good" });
    expect(summary[rVar.id]).toBeUndefined(); // variant untouched
  });
  it("in-place override keeps the recipe tried (same recipeId)", async () => {
    const svc = makeService();
    const { recipe, version } = await svc.createRecipe({
      name: "Base", yield: { amount: 1, unit: "x" }, content: content(),
    });
    await svc.addFeedback({ versionId: version.id, kind: "made", rating: "good" });
    const { version: v2 } = await svc.applyOverride({
      versionId: version.id,
      entry: {
        op: "replace", kind: "usage", target: "u1",
        payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 100, quantityUnit: "g" },
      },
    });
    expect(v2.recipeId).toBe(recipe.id);
    expect((await svc.feedbackSummary())[recipe.id]?.tried).toBe(true);
  });
});

describe("createRecipe provenance (CM-7)", () => {
  it("records parentVersionIds + provenanceNote when given", async () => {
    const s = makeService();
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const b = await s.createRecipe({ name: "B", yield: { amount: 1, unit: "x" }, content: content() });
    const champ = await s.createRecipe({
      name: "Champion", yield: { amount: 1, unit: "x" }, content: content(),
      parents: [a.version.id, b.version.id], rationale: "cornstarch from A, zest from B",
    });
    expect(champ.version.parentVersionIds).toEqual([a.version.id, b.version.id]);
    expect(champ.version.provenanceNote).toBe("cornstarch from A, zest from B");
  });
  it("omits the fields entirely when not given (old-store shape preserved)", async () => {
    const s = makeService();
    const r = await s.createRecipe({ name: "Plain", yield: { amount: 1, unit: "x" }, content: content() });
    expect("parentVersionIds" in r.version).toBe(false);
    expect("provenanceNote" in r.version).toBe(false);
  });
  it("rejects an unknown parent version", async () => {
    const s = makeService();
    await expect(s.createRecipe({
      name: "X", yield: { amount: 1, unit: "x" }, content: content(), parents: ["nope"],
    })).rejects.toThrow("version not found: nope");
  });
});

describe("service.compare (CM-3)", () => {
  async function seedIng(s: ReturnType<typeof makeService>) {
    await s.addIngredient({ id: "ing-sugar", name: "Sugar", macrosPer100g: { calories: 400, protein: 0, carbs: 100, fat: 0, fiber: 0 } });
    await s.addIngredient({ id: "ing-corn", name: "Cornstarch", macrosPer100g: { calories: 380, protein: 0, carbs: 91, fat: 0, fiber: 0 } });
  }
  function cookie(withCorn: boolean): RecipeContent {
    const slots = [{ componentKey: "sg", name: "sugar", resolution: { kind: "raw" as const, libraryIngredientId: "ing-sugar" } }];
    const usages = [{ componentKey: "usg", stepKey: "s1", slotKey: "sg", quantityValue: 100, quantityUnit: "g" }];
    if (withCorn) {
      slots.push({ componentKey: "cn", name: "cornstarch", resolution: { kind: "raw" as const, libraryIngredientId: "ing-corn" } });
      usages.push({ componentKey: "ucn", stepKey: "s1", slotKey: "cn", quantityValue: 10, quantityUnit: "g" });
    }
    return { steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }], slots, usages };
  }

  it("aligns separate roots; only the cornstarch user has a value, others null", async () => {
    const s = makeService();
    await seedIng(s);
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: cookie(true) });
    const b = await s.createRecipe({ name: "B", yield: { amount: 1, unit: "x" }, content: cookie(false) });
    const view = await s.compare([a.version.id, b.version.id]);
    const corn = view.ingredients.find((r) => r.ingredientId === "ing-corn")!;
    expect(corn.perServingGrams[a.version.id]).toBe(10);
    expect(corn.perServingGrams[b.version.id]).toBeNull();
    expect(view.columns.map((c) => c.name).sort()).toEqual(["A", "B"]);
  });

  it("rejects fewer than two versions", async () => {
    const s = makeService();
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: cookie(false) });
    await expect(s.compare([a.version.id])).rejects.toThrow("at least two");
  });

  it("rejects an unknown version id", async () => {
    const s = makeService();
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: cookie(false) });
    await expect(s.compare([a.version.id, "nope"])).rejects.toThrow("version not found: nope");
  });
});

describe("service.rebase (CM-5/CM-6)", () => {
  function twoSlot(sugar: number): RecipeContent {
    return {
      steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }],
      slots: [{ componentKey: "sl-sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
      usages: [{ componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: sugar, quantityUnit: "g" }],
    };
  }

  it("propagates a clean base improvement into the variant and re-points the lineage", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const variant = await s.deriveVariant({ baseVersionId: base.version.id, name: "V" });
    // variant tweaks the step only
    await s.applyOverride({ versionId: variant.version.id, entry: { op: "replace", kind: "step", target: "s1",
      payload: { componentKey: "s1", order: 1, instructionText: "bake longer" } } });
    const variantHead = (await s.getRecipe(variant.recipe.id)).headVersionId;
    // base cuts sugar 100→80
    const base2 = await s.applyOverride({ versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 80, quantityUnit: "g" } } });
    const { version, conflicts } = await s.rebase({ variantVersionId: variantHead, ontoVersionId: base2.version.id });
    expect(conflicts).toEqual([]);
    expect(version.derivesFromVersionId).toBe(base2.version.id);
    expect(version.content.usages.find((u) => u.componentKey === "u-sugar")?.quantityValue).toBe(80); // propagated
    expect(version.content.steps[0]?.instructionText).toBe("bake longer"); // variant kept
    expect((await s.getRecipe(variant.recipe.id)).headVersionId).toBe(version.id); // head advanced
  });

  it("reports a conflict when base and variant both changed the same usage (variant-wins)", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const variant = await s.deriveVariant({ baseVersionId: base.version.id, name: "V" });
    const v2 = await s.applyOverride({ versionId: variant.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 120, quantityUnit: "g" } } });
    const base2 = await s.applyOverride({ versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 80, quantityUnit: "g" } } });
    const { version, conflicts } = await s.rebase({ variantVersionId: v2.version.id, ontoVersionId: base2.version.id });
    expect(version.content.usages.find((u) => u.componentKey === "u-sugar")?.quantityValue).toBe(120); // variant-wins
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.componentKey).toBe("u-sugar");
  });

  it("rejects rebasing a root (not a variant)", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    await expect(s.rebase({ variantVersionId: base.version.id, ontoVersionId: base.version.id }))
      .rejects.toThrow("not a variant");
  });

  it("rejects a cross-lineage onto target (CM-6)", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const other = await s.createRecipe({ name: "Other", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const variant = await s.deriveVariant({ baseVersionId: base.version.id, name: "V" });
    await expect(s.rebase({ variantVersionId: variant.version.id, ontoVersionId: other.version.id }))
      .rejects.toThrow("across lineages");
  });

  it("does not inherit CM-7 amalgam provenance (parentVersionIds/provenanceNote) into the rebased version", async () => {
    const repo = new InMemoryRepository();
    const s = new RecipeService(repo, testDeps());
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const variant = await s.deriveVariant({ baseVersionId: base.version.id, name: "V" });
    // Make the variant a "champion": stamp amalgam provenance onto its head version directly.
    const champ = { ...variant.version, parentVersionIds: ["p1", "p2"], provenanceNote: "merged from p1 + p2" };
    await repo.saveVersion(champ);
    const base2 = await s.applyOverride({ versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 80, quantityUnit: "g" } } });
    const { version } = await s.rebase({ variantVersionId: champ.id, ontoVersionId: base2.version.id });
    expect(version.parentVersionIds).toBeUndefined(); // single derivation lineage, not multi-parent
    expect(version.provenanceNote).toBeUndefined();
    expect(version.derivesFromVersionId).toBe(base2.version.id);
  });
});

describe("service.rebaseVariants (CM-8)", () => {
  function oneSlot(sugar: number): RecipeContent {
    return {
      steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }],
      slots: [{ componentKey: "sl-sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
      usages: [{ componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: sugar, quantityUnit: "g" }],
    };
  }

  it("rebases every variant of a base onto the base's head", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: oneSlot(100) });
    const va = await s.deriveVariant({ baseVersionId: base.version.id, name: "VA" });
    const vb = await s.deriveVariant({ baseVersionId: base.version.id, name: "VB" });
    // base cuts sugar 100→70 (advances the base head)
    const base2 = await s.applyOverride({ versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 70, quantityUnit: "g" } } });
    const { results } = await s.rebaseVariants({ baseVersionId: base2.version.id });
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.version.derivesFromVersionId).toBe(base2.version.id);
      expect(r.version.content.usages[0]?.quantityValue).toBe(70); // propagated to each
      expect(r.conflicts).toEqual([]);
      expect((await s.getRecipe(r.recipeId)).headVersionId).toBe(r.version.id); // each variant head advanced
    }
    expect(results.map((r) => r.recipeId).sort()).toEqual([va.recipe.id, vb.recipe.id].sort());
  });
});
