import type { Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";
import type { Repository } from "./repository.js";

export class InMemoryRepository implements Repository {
  private recipes = new Map<RecipeId, Recipe>();
  private versions = new Map<VersionId, RecipeVersion>();

  async saveRecipe(recipe: Recipe): Promise<void> {
    this.recipes.set(recipe.id, structuredClone(recipe));
  }
  async getRecipe(id: RecipeId): Promise<Recipe | undefined> {
    const r = this.recipes.get(id);
    return r ? structuredClone(r) : undefined;
  }
  async saveVersion(version: RecipeVersion): Promise<void> {
    this.versions.set(version.id, structuredClone(version));
  }
  async getVersion(id: VersionId): Promise<RecipeVersion | undefined> {
    const v = this.versions.get(id);
    return v ? structuredClone(v) : undefined;
  }
  async setHead(recipeId: RecipeId, versionId: VersionId): Promise<void> {
    const r = this.recipes.get(recipeId);
    if (!r) throw new Error(`recipe not found: ${recipeId}`);
    r.headVersionId = versionId;
  }
  async listRecipes(): Promise<Recipe[]> {
    return [...this.recipes.values()].map((r) => structuredClone(r));
  }
  async listVersions(): Promise<RecipeVersion[]> {
    return [...this.versions.values()].map((v) => structuredClone(v));
  }
}
