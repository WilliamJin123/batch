import {
  InMemoryRepository, RecipeService, realDeps,
  type Repository, type Recipe, type RecipeVersion, type LibraryIngredient, type FeedbackEntry,
} from "@batch/core";

export interface RawDb {
  recipes: Record<string, Recipe>;
  versions: Record<string, RecipeVersion>;
  ingredients: Record<string, LibraryIngredient>;
  feedback: Record<string, FeedbackEntry>;
}

export async function buildRepository(db: RawDb): Promise<Repository> {
  const repo = new InMemoryRepository();
  for (const r of Object.values(db.recipes ?? {})) await repo.saveRecipe(r);
  for (const v of Object.values(db.versions ?? {})) await repo.saveVersion(v);
  for (const i of Object.values(db.ingredients ?? {})) await repo.saveIngredient(i);
  for (const f of Object.values(db.feedback ?? {})) await repo.saveFeedback(f);
  return repo;
}

/** realDeps() is harmless here — read paths never call newId()/now(). */
export function serviceFrom(repo: Repository): RecipeService {
  return new RecipeService(repo, realDeps());
}

/** Build-time only (Node): read the baked db.json. */
export async function loadDb(): Promise<RawDb> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const path = join(process.cwd(), "data", "db.json");
  return JSON.parse(await readFile(path, "utf8")) as RawDb;
}
