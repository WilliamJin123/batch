import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type {
  FeedbackEntry, LibraryIngredient, Recipe, RecipeId, RecipeVersion, VersionId, Repository,
} from "@batch/core";

interface Db {
  recipes: Record<string, Recipe>;
  versions: Record<string, RecipeVersion>;
  ingredients: Record<string, LibraryIngredient>;
  feedback: Record<string, FeedbackEntry>;
}

export class FileRepository implements Repository {
  private data: Db | null = null;

  constructor(private readonly path: string) {}

  private async load(): Promise<Db> {
    if (this.data) return this.data;
    try {
      const raw = await fs.readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<Db>;
      // Normalize so stores written before a key existed still load (e.g. pre-M2 had no `ingredients`).
      this.data = {
        recipes: parsed.recipes ?? {},
        versions: parsed.versions ?? {},
        ingredients: parsed.ingredients ?? {},
        feedback: parsed.feedback ?? {},
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.data = { recipes: {}, versions: {}, ingredients: {}, feedback: {} };
      } else {
        throw err;
      }
    }
    return this.data;
  }

  private async flush(): Promise<void> {
    const data = await this.load();
    await fs.mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, this.path); // atomic replace
  }

  async saveRecipe(recipe: Recipe): Promise<void> {
    const d = await this.load();
    d.recipes[recipe.id] = structuredClone(recipe);
    await this.flush();
  }
  async getRecipe(id: RecipeId): Promise<Recipe | undefined> {
    const r = (await this.load()).recipes[id];
    return r ? structuredClone(r) : undefined;
  }
  async saveVersion(version: RecipeVersion): Promise<void> {
    const d = await this.load();
    d.versions[version.id] = structuredClone(version);
    await this.flush();
  }
  async getVersion(id: VersionId): Promise<RecipeVersion | undefined> {
    const v = (await this.load()).versions[id];
    return v ? structuredClone(v) : undefined;
  }
  async setHead(recipeId: RecipeId, versionId: VersionId): Promise<void> {
    const d = await this.load();
    const r = d.recipes[recipeId];
    if (!r) throw new Error(`recipe not found: ${recipeId}`);
    r.headVersionId = versionId;
    await this.flush();
  }
  async listRecipes(): Promise<Recipe[]> {
    return Object.values((await this.load()).recipes).map((r) => structuredClone(r));
  }
  async listVersions(): Promise<RecipeVersion[]> {
    return Object.values((await this.load()).versions).map((v) => structuredClone(v));
  }
  async saveIngredient(ingredient: LibraryIngredient): Promise<void> {
    const d = await this.load();
    d.ingredients[ingredient.id] = structuredClone(ingredient);
    await this.flush();
  }
  async getIngredient(id: string): Promise<LibraryIngredient | undefined> {
    const i = (await this.load()).ingredients[id];
    return i ? structuredClone(i) : undefined;
  }
  async listIngredients(): Promise<LibraryIngredient[]> {
    return Object.values((await this.load()).ingredients).map((i) => structuredClone(i));
  }
  async saveFeedback(entry: FeedbackEntry): Promise<void> {
    const d = await this.load();
    d.feedback[entry.id] = structuredClone(entry);
    await this.flush();
  }
  async getFeedback(id: string): Promise<FeedbackEntry | undefined> {
    const f = (await this.load()).feedback[id];
    return f ? structuredClone(f) : undefined;
  }
  async listFeedback(): Promise<FeedbackEntry[]> {
    return Object.values((await this.load()).feedback).map((f) => structuredClone(f));
  }
  async deleteFeedback(id: string): Promise<void> {
    const d = await this.load();
    delete d.feedback[id];
    await this.flush();
  }
}
