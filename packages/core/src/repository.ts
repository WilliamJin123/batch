import type { Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";

export interface Repository {
  saveRecipe(recipe: Recipe): Promise<void>;
  getRecipe(id: RecipeId): Promise<Recipe | undefined>;
  saveVersion(version: RecipeVersion): Promise<void>;
  getVersion(id: VersionId): Promise<RecipeVersion | undefined>;
  setHead(recipeId: RecipeId, versionId: VersionId): Promise<void>;
  listRecipes(): Promise<Recipe[]>;
  listVersions(): Promise<RecipeVersion[]>;
}
