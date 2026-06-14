import type {
  Author, LibraryIngredient, MacroSnapshot, OverrideEntry, OverrideSet,
  Recipe, RecipeContent, RecipeId, RecipeVersion, VersionId, VersionStatus, Yield,
} from "./types.js";
import type { Repository } from "./repository.js";
import type { Deps } from "./deps.js";
import { materialize } from "./materialize.js";
import { computeMacros } from "./compute-macros.js";

export class RecipeService {
  constructor(private repo: Repository, private deps: Deps) {}

  /** Load the library ingredients referenced by `content` and compute its macro snapshot. */
  private async macrosFor(content: RecipeContent, yieldSpec: Yield): Promise<MacroSnapshot> {
    const ids = new Set<string>();
    for (const slot of content.slots) {
      if (slot.resolution.kind === "raw") ids.add(slot.resolution.libraryIngredientId);
    }
    const ingredients = new Map<string, LibraryIngredient>();
    for (const id of ids) {
      const ing = await this.repo.getIngredient(id);
      if (ing) ingredients.set(id, ing);
    }
    return computeMacros(content, yieldSpec, ingredients);
  }

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

    const content = structuredClone(input.content);
    const macros = await this.macrosFor(content, input.yield);
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
      content,
      macros,
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
    const content = materialize(base.content, overrideSet);
    const macros = await this.macrosFor(content, base.yield);
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
      content,
      macros,
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
    let overrideSet: OverrideSet | undefined;
    let content: RecipeContent;
    if (current.overrideSet && current.derivesFromVersionId) {
      // Variant: extend its delta against the base version, then re-materialize.
      const base = await this.getVersion(current.derivesFromVersionId);
      overrideSet = {
        ...current.overrideSet,
        entries: [...current.overrideSet.entries, input.entry],
      };
      content = materialize(base.content, overrideSet);
    } else {
      // Root (base): apply the change straight into its content. It stays a root
      // (full content, no delta) — this is how you tune a base version in place.
      overrideSet = current.overrideSet; // undefined for a root
      content = materialize(current.content, { entries: [input.entry] });
    }
    const macros = await this.macrosFor(content, current.yield);
    const version: RecipeVersion = {
      ...current,
      id: this.deps.newId(),
      prevVersionId: current.id,
      overrideSet,
      content,
      macros,
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
    const newYield = p.yield ?? current.yield;
    const macros = await this.macrosFor(current.content, newYield);
    const version: RecipeVersion = {
      ...current,
      id: this.deps.newId(),
      prevVersionId: current.id,
      name: p.name ?? current.name,
      description: p.description ?? current.description,
      tags: p.tags ?? current.tags,
      yield: newYield,
      status: p.status ?? current.status,
      overrideSet,
      macros,
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

  async addIngredient(ingredient: LibraryIngredient): Promise<LibraryIngredient> {
    await this.repo.saveIngredient(ingredient);
    return ingredient;
  }
  async getIngredient(id: string): Promise<LibraryIngredient | undefined> {
    return this.repo.getIngredient(id);
  }
  async listIngredients(): Promise<LibraryIngredient[]> {
    return this.repo.listIngredients();
  }

  /**
   * Recompute macros against the *current* library and snapshot them onto a new
   * version (D9 — author defaults to "system"; the immutable chain is preserved).
   * Idempotent: if the recomputed macros match, the current version is returned
   * unchanged (no version churn).
   */
  async recomputeMacros(input: {
    versionId: VersionId;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ version: RecipeVersion }> {
    const current = await this.getVersion(input.versionId);
    const macros = await this.macrosFor(current.content, current.yield);
    if (JSON.stringify(macros) === JSON.stringify(current.macros)) {
      return { version: current };
    }
    const version: RecipeVersion = {
      ...current,
      id: this.deps.newId(),
      prevVersionId: current.id,
      macros,
      author: input.author ?? "system",
      commitMessage: input.commitMessage ?? "recompute macros",
      createdAt: this.deps.now(),
    };
    await this.repo.saveVersion(version);
    await this.repo.setHead(version.recipeId, version.id);
    return { version };
  }
}
