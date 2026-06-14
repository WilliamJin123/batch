import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type {
  Recipe, RecipeId, RecipeVersion, VersionId, Repository,
} from "@batch/core";

interface Db {
  recipes: Record<string, Recipe>;
  versions: Record<string, RecipeVersion>;
}

export class FileRepository implements Repository {
  private data: Db | null = null;

  constructor(private readonly path: string) {}

  private async load(): Promise<Db> {
    if (this.data) return this.data;
    try {
      const raw = await fs.readFile(this.path, "utf8");
      this.data = JSON.parse(raw) as Db;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.data = { recipes: {}, versions: {} };
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
}
