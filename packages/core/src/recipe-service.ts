import type {
  Author, OverrideEntry, OverrideSet, Recipe, RecipeContent, RecipeId, RecipeVersion, VersionId, VersionStatus, Yield,
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

  async applyOverride(input: {
    versionId: VersionId;
    entry: OverrideEntry;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ version: RecipeVersion }> {
    const current = await this.getVersion(input.versionId);
    if (!current.overrideSet || !current.derivesFromVersionId) {
      throw new Error(`version ${current.id} is not a variant`);
    }
    const base = await this.getVersion(current.derivesFromVersionId);
    const overrideSet: OverrideSet = {
      ...current.overrideSet,
      entries: [...current.overrideSet.entries, input.entry],
    };
    const version: RecipeVersion = {
      ...current,
      id: this.deps.newId(),
      prevVersionId: current.id,
      overrideSet,
      content: materialize(base.content, overrideSet),
      author: input.author ?? current.author,
      commitMessage: input.commitMessage ?? "apply override",
      status: "draft",
      createdAt: this.deps.now(),
    };
    await this.repo.saveVersion(version);
    await this.repo.setHead(version.recipeId, version.id);
    return { version };
  }

  async editMetadata(input: {
    versionId: VersionId;
    patch: { name?: string; description?: string; tags?: string[]; yield?: Yield; status?: VersionStatus };
    author?: Author;
    commitMessage?: string;
  }): Promise<{ version: RecipeVersion }> {
    const current = await this.getVersion(input.versionId);
    const p = input.patch;
    const overrideSet = current.overrideSet
      ? {
          ...current.overrideSet,
          ...(p.name !== undefined ? { name: p.name } : {}),
          ...(p.yield !== undefined ? { yield: p.yield } : {}),
          ...(p.tags !== undefined ? { tags: p.tags } : {}),
        }
      : current.overrideSet;
    const version: RecipeVersion = {
      ...current,
      id: this.deps.newId(),
      prevVersionId: current.id,
      name: p.name ?? current.name,
      description: p.description ?? current.description,
      tags: p.tags ?? current.tags,
      yield: p.yield ?? current.yield,
      status: p.status ?? current.status,
      overrideSet,
      author: input.author ?? current.author,
      commitMessage: input.commitMessage ?? "edit metadata",
      createdAt: this.deps.now(),
    };
    await this.repo.saveVersion(version);
    await this.repo.setHead(version.recipeId, version.id);
    return { version };
  }

  async getHistory(versionId: VersionId): Promise<RecipeVersion[]> {
    const out: RecipeVersion[] = [];
    let cursor: VersionId | undefined = versionId;
    while (cursor) {
      const v: RecipeVersion = await this.getVersion(cursor);
      out.push(v);
      cursor = v.prevVersionId;
    }
    return out;
  }

  async listRecipes(): Promise<Recipe[]> {
    return this.repo.listRecipes();
  }
  async listVersions(): Promise<RecipeVersion[]> {
    return this.repo.listVersions();
  }
  async getRecipe(id: RecipeId): Promise<Recipe> {
    const r = await this.repo.getRecipe(id);
    if (!r) throw new Error(`recipe not found: ${id}`);
    return r;
  }
}
