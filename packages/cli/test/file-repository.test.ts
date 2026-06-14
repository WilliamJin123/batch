import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { FileRepository } from "../src/file-repository.js";
import type { Recipe, RecipeVersion } from "@batch/core";

const DIR = join(process.cwd(), ".test-tmp");
const DB = join(DIR, "db.json");

function recipe(id: string, head: string): Recipe {
  return { id, createdBy: "user", createdAt: "2026-01-01T00:00:00.000Z", headVersionId: head };
}
function version(id: string, recipeId: string): RecipeVersion {
  return {
    id, recipeId, name: "R", tags: [], yield: { amount: 1, unit: "x" },
    status: "draft", author: "user", commitMessage: "c",
    content: { steps: [], slots: [], usages: [] }, createdAt: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(async () => { await fs.rm(DIR, { recursive: true, force: true }); });
afterEach(async () => { await fs.rm(DIR, { recursive: true, force: true }); });

describe("FileRepository", () => {
  it("returns undefined / empty lists when the store does not exist", async () => {
    const repo = new FileRepository(DB);
    expect(await repo.getRecipe("nope")).toBeUndefined();
    expect(await repo.listRecipes()).toEqual([]);
  });

  it("persists across instances and writes pretty JSON to disk", async () => {
    const a = new FileRepository(DB);
    await a.saveRecipe(recipe("r1", "v1"));
    await a.saveVersion(version("v1", "r1"));
    // a fresh instance reads what was written
    const b = new FileRepository(DB);
    expect((await b.getRecipe("r1"))?.headVersionId).toBe("v1");
    expect(await b.listVersions()).toHaveLength(1);
    const raw = await fs.readFile(DB, "utf8");
    expect(raw).toContain("\n"); // pretty-printed
    expect(JSON.parse(raw).recipes.r1.id).toBe("r1");
  });

  it("setHead updates and persists", async () => {
    const repo = new FileRepository(DB);
    await repo.saveRecipe(recipe("r1", "v1"));
    await repo.setHead("r1", "v2");
    expect((await new FileRepository(DB).getRecipe("r1"))?.headVersionId).toBe("v2");
  });

  it("returns copies, not internal references", async () => {
    const repo = new FileRepository(DB);
    await repo.saveRecipe(recipe("r1", "v1"));
    const got = await repo.getRecipe("r1");
    got!.headVersionId = "MUTATED";
    expect((await repo.getRecipe("r1"))?.headVersionId).toBe("v1");
  });
});
