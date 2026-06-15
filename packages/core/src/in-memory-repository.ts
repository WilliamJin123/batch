import type { FeedbackEntry, LibraryIngredient, Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";
import type { Repository } from "./repository.js";

export class InMemoryRepository implements Repository {
  private recipes = new Map<RecipeId, Recipe>();
  private versions = new Map<VersionId, RecipeVersion>();
  private ingredients = new Map<string, LibraryIngredient>();
  private feedback = new Map<string, FeedbackEntry>();

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
  async saveIngredient(ingredient: LibraryIngredient): Promise<void> {
    this.ingredients.set(ingredient.id, structuredClone(ingredient));
  }
  async getIngredient(id: string): Promise<LibraryIngredient | undefined> {
    const i = this.ingredients.get(id);
    return i ? structuredClone(i) : undefined;
  }
  async listIngredients(): Promise<LibraryIngredient[]> {
    return [...this.ingredients.values()].map((i) => structuredClone(i));
  }
  async saveFeedback(entry: FeedbackEntry): Promise<void> {
    this.feedback.set(entry.id, structuredClone(entry));
  }
  async getFeedback(id: string): Promise<FeedbackEntry | undefined> {
    const f = this.feedback.get(id);
    return f ? structuredClone(f) : undefined;
  }
  async listFeedback(): Promise<FeedbackEntry[]> {
    return [...this.feedback.values()].map((f) => structuredClone(f));
  }
  async deleteFeedback(id: string): Promise<void> {
    this.feedback.delete(id);
  }
}
