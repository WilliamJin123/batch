import type {
  Author, OverrideSet, Recipe, RecipeContent, RecipeVersion, VersionId, Yield,
} from "./types.js";
import type { Repository } from "./repository.js";
import type { Deps } from "./deps.js";
import { materialize } from "./materialize.js";

export class RecipeService {
  constructor(private repo: Repository, private deps: Deps) {}

  async getVersion(id: VersionId): Promise<RecipeVersion> {
    const v = await this.repo.getVersion(id);
    if (!v) throw new Error(`version not found: ${id}`);
    return v;
  }

  async resolve(id: VersionId): Promise<RecipeContent> {
    return (await this.getVersion(id)).content;
  }

  async createRecipe(input: {
    name: string;
    description?: string;
    tags?: string[];
    yield: Yield;
    content: RecipeContent;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ recipe: Recipe; version: RecipeVersion }> {
    const recipeId = this.deps.newId();
    const versionId = this.deps.newId();
    const now = this.deps.now();
    const author = input.author ?? "user";

    const version: RecipeVersion = {
      id: versionId,
      recipeId,
      name: input.name,
      description: input.description,
      tags: input.tags ?? [],
      yield: input.yield,
      status: "draft",
      author,
      commitMessage: input.commitMessage ?? "create recipe",
      content: structuredClone(input.content),
      createdAt: now,
    };
    const recipe: Recipe = { id: recipeId, createdBy: author, createdAt: now, headVersionId: versionId };

    await this.repo.saveRecipe(recipe);
    await this.repo.saveVersion(version);
    return { recipe, version };
  }

  async deriveVariant(input: {
    baseVersionId: VersionId;
    name: string;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ recipe: Recipe; version: RecipeVersion }> {
    const base = await this.getVersion(input.baseVersionId);
    const recipeId = this.deps.newId();
    const versionId = this.deps.newId();
    const now = this.deps.now();
    const author = input.author ?? "user";

    const overrideSet: OverrideSet = { entries: [], name: input.name };
    const version: RecipeVersion = {
      id: versionId,
      recipeId,
      derivesFromVersionId: base.id,
      name: input.name,
      tags: [],
      yield: base.yield,
      status: "draft",
      author,
      commitMessage: input.commitMessage ?? `derive variant from ${base.name}`,
      overrideSet,
      content: materialize(base.content, overrideSet),
      createdAt: now,
    };
    const recipe: Recipe = { id: recipeId, createdBy: author, createdAt: now, headVersionId: versionId };
    await this.repo.saveRecipe(recipe);
    await this.repo.saveVersion(version);
    return { recipe, version };
  }
}
