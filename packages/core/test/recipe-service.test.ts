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
