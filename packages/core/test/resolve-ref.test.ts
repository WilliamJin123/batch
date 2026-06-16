import { describe, it, expect } from "vitest";
import { RecipeService } from "../src/recipe-service.js";
import { InMemoryRepository } from "../src/in-memory-repository.js";
import { testDeps } from "../src/deps.js";
import type { RecipeContent } from "../src/types.js";

const svc = () => new RecipeService(new InMemoryRepository(), testDeps());
const content = (): RecipeContent => ({
  steps: [{ componentKey: "s1", order: 1, instructionText: "mix" }],
  slots: [],
  usages: [],
});

describe("resolveRef", () => {
  it("resolves an exact version id", async () => {
    const s = svc();
    const { version } = await s.createRecipe({ name: "Brownies", yield: { amount: 1, unit: "pan" }, content: content() });
    expect(await s.resolveRef(version.id)).toBe(version.id);
  });

  it("resolves a recipe name (case-insensitive) to its head", async () => {
    const s = svc();
    const { version } = await s.createRecipe({ name: "Brownies", yield: { amount: 1, unit: "pan" }, content: content() });
    expect(await s.resolveRef("brownies")).toBe(version.id);
  });

  it("resolves a unique version-id prefix", async () => {
    const s = svc();
    const { version } = await s.createRecipe({ name: "Brownies", yield: { amount: 1, unit: "pan" }, content: content() });
    expect(await s.resolveRef(version.id.slice(0, 8))).toBe(version.id);
  });

  it("follows the head after an edit (name still resolves to the newest version)", async () => {
    const s = svc();
    const { version: v1 } = await s.createRecipe({ name: "Cake", yield: { amount: 1, unit: "pan" }, content: content() });
    const { version: v2 } = await s.editMetadata({ versionId: v1.id, patch: { status: "approved" } });
    expect(await s.resolveRef("Cake")).toBe(v2.id);
  });

  it("throws listing candidates when a name matches >1 recipe", async () => {
    const s = svc();
    await s.createRecipe({ name: "Cake", yield: { amount: 1, unit: "pan" }, content: content() });
    await s.createRecipe({ name: "Cake", yield: { amount: 1, unit: "pan" }, content: content() });
    await expect(s.resolveRef("Cake")).rejects.toThrow(/ambiguous name/i);
  });

  it("throws when nothing matches", async () => {
    await expect(svc().resolveRef("nope-nope")).rejects.toThrow(/no recipe or version/i);
  });
});
