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
});

import { RecipeService } from "../src/recipe-service.js";
import { testDeps } from "../src/deps.js";
import type { RecipeContent } from "../src/types.js";

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
