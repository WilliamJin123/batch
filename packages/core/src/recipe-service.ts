import type {
  Author, ComponentKey, FeedbackBase, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient,
  MacroLine, MacroSnapshot, OverrideEntry, OverrideSet, Rating, Recipe, RecipeContent, RecipeId,
  RecipeVersion, SubRecipeMacro, VersionId, VersionStatus, Yield,
} from "./types.js";
import type { Repository } from "./repository.js";
import type { Deps } from "./deps.js";
import { materialize } from "./materialize.js";
import { computeMacros } from "./compute-macros.js";
import { flattenContent, type SubContent } from "./flatten.js";
import { buildCompareView, type CompareInput, type CompareView } from "./compare.js";
import { summarizeFeedback, latestFirst, type RecipeFeedbackSummary } from "./feedback.js";

function sumLineGrams(lines: MacroLine[]): number {
  return lines.reduce((g, l) => g + (l.grams ?? 0), 0);
}

export class RecipeService {
  constructor(private repo: Repository, private deps: Deps) {}

  /** Load the library ingredients + pinned sub-recipe snapshots referenced by `content`, then compute. */
  private async macrosFor(content: RecipeContent, yieldSpec: Yield): Promise<MacroSnapshot> {
    const ids = new Set<string>();
    const subIds = new Set<string>();
    for (const slot of content.slots) {
      if (slot.resolution.kind === "raw") ids.add(slot.resolution.libraryIngredientId);
      else if (slot.resolution.kind === "sub_recipe") subIds.add(slot.resolution.subRecipeVersionId);
    }
    const ingredients = new Map<string, LibraryIngredient>();
    for (const id of ids) {
      const ing = await this.repo.getIngredient(id);
      if (ing) ingredients.set(id, ing);
    }
    const subRecipes = new Map<string, SubRecipeMacro>();
    for (const id of subIds) {
      const v = await this.repo.getVersion(id);
      if (v?.macros) {
        subRecipes.set(id, {
          total: v.macros.total, yield: v.macros.yield,
          totalGrams: sumLineGrams(v.macros.lines), basis: v.macros.basis,
        });
      }
    }
    return computeMacros(content, yieldSpec, ingredients, subRecipes);
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
    parents?: VersionId[];   // CM-7
    rationale?: string;      // CM-7
  }): Promise<{ recipe: Recipe; version: RecipeVersion }> {
    const recipeId = this.deps.newId();
    const versionId = this.deps.newId();
    const now = this.deps.now();
    const author = input.author ?? "user";

    const content = structuredClone(input.content);
    const macros = await this.macrosFor(content, input.yield);
    if (input.parents) for (const pid of input.parents) await this.getVersion(pid); // validate existence (throws)
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
      ...(input.parents && input.parents.length ? { parentVersionIds: input.parents } : {}),
      ...(input.rationale ? { provenanceNote: input.rationale } : {}),
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
    if ((input.entry.op === "add" || input.entry.op === "replace") && input.entry.kind === "slot") {
      const res = input.entry.payload.resolution;
      if (res.kind === "sub_recipe") await this.assertAcyclic(current.recipeId, res.subRecipeVersionId);
    }
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

  /** Expand a composed recipe into one flat card (DM3-3) — derived, never stored. */
  async flatten(versionId: VersionId): Promise<{ content: RecipeContent; sources: FlattenSource[] }> {
    const v = await this.getVersion(versionId);
    const subContents = new Map<string, SubContent>();
    const sources: FlattenSource[] = [];
    await this.gatherSubContents(v.content, subContents, sources);
    return { content: flattenContent(v.content, subContents), sources };
  }

  private async gatherSubContents(
    content: RecipeContent, subContents: Map<string, SubContent>, sources: FlattenSource[],
  ): Promise<void> {
    for (const slot of content.slots) {
      if (slot.resolution.kind !== "sub_recipe") continue;
      const id = slot.resolution.subRecipeVersionId;
      if (subContents.has(id)) continue;
      const child = await this.repo.getVersion(id);
      if (!child) continue;
      const totalGrams = child.macros ? sumLineGrams(child.macros.lines) : 0;
      subContents.set(id, { content: child.content, yield: child.yield, totalGrams, name: child.name });
      sources.push({ versionId: id, recipeName: child.name, behind: await this.staleness(id) });
      await this.gatherSubContents(child.content, subContents, sources);
    }
  }

  /** Align ≥2 versions into the compare view-model (CM-3): ingredient matrix + macros + verdicts. Read-only. */
  async compare(versionIds: VersionId[]): Promise<CompareView> {
    if (versionIds.length < 2) throw new Error("compare needs at least two versions");
    const ingredients = new Map<string, LibraryIngredient>();
    const inputs: CompareInput[] = [];
    for (const id of versionIds) {
      const v = await this.getVersion(id); // throws on unknown id
      const { content } = await this.flatten(id);
      for (const slot of content.slots) {
        if (slot.resolution.kind === "raw" && !ingredients.has(slot.resolution.libraryIngredientId)) {
          const ing = await this.repo.getIngredient(slot.resolution.libraryIngredientId);
          if (ing) ingredients.set(ing.id, ing);
        }
      }
      inputs.push({
        versionId: v.id, recipeId: v.recipeId, name: v.name,
        isVariant: v.derivesFromVersionId !== undefined,
        yield: v.yield,
        perServing: v.macros?.perServing ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        macroBasis: v.macros?.basis ?? "partial",
        content,
        feedback: await this.feedbackForRecipe(v.recipeId),
      });
    }
    return buildCompareView(inputs, ingredients);
  }

  /**
   * Append one tasting-log entry, pinned to `versionId` (provenance) and rolled up by its
   * `recipeId`. Append-only and orthogonal: never writes a RecipeVersion or moves a head (DF-6).
   */
  async addFeedback(input: {
    versionId: VersionId;
    kind: FeedbackKind;
    rating?: Rating;
    componentKey?: ComponentKey;
    notes?: string;
    date?: string;
    author?: Author;
  }): Promise<FeedbackEntry> {
    const version = await this.getVersion(input.versionId); // validates existence (throws if unknown)
    const now = this.deps.now();
    const base: FeedbackBase = {
      id: this.deps.newId(),
      recipeId: version.recipeId,
      versionId: version.id,
      componentKey: input.componentKey,
      notes: input.notes,
      date: input.date ?? now,
      author: input.author ?? "user",
      createdAt: now,
    };
    const entry: FeedbackEntry =
      input.kind === "made"
        ? { kind: "made", rating: input.rating, ...base }
        : { kind: "to-make", ...base };
    await this.repo.saveFeedback(entry);
    return entry;
  }

  async deleteFeedback(id: string): Promise<void> {
    await this.repo.deleteFeedback(id);
  }

  async feedbackForRecipe(recipeId: RecipeId): Promise<FeedbackEntry[]> {
    return latestFirst((await this.repo.listFeedback()).filter((e) => e.recipeId === recipeId));
  }
  async feedbackForVersion(versionId: VersionId): Promise<FeedbackEntry[]> {
    return latestFirst((await this.repo.listFeedback()).filter((e) => e.versionId === versionId));
  }
  async feedbackSummary(): Promise<Record<RecipeId, RecipeFeedbackSummary>> {
    return summarizeFeedback(await this.repo.listFeedback());
  }

  /**
   * How many versions the pinned recipe's head is ahead of this pin (UC12; 0 = current).
   * Returns `-1` when the pin is not on the head's linear history (a diverged/abandoned
   * branch) — counting the head chain would over-report, so we signal "off-branch" instead.
   */
  async staleness(pinVersionId: VersionId): Promise<number> {
    const pin = await this.repo.getVersion(pinVersionId);
    if (!pin) return 0;
    const recipe = await this.repo.getRecipe(pin.recipeId);
    if (!recipe) return 0;
    let cursor: VersionId | undefined = recipe.headVersionId;
    let n = 0;
    while (cursor) {
      if (cursor === pinVersionId) return n;
      const v: RecipeVersion | undefined = await this.repo.getVersion(cursor);
      if (!v) break;
      cursor = v.prevVersionId;
      n++;
    }
    return -1; // walked the whole head chain without meeting the pin → not on this history
  }

  /** Reject composing `targetSubVersionId` if its sub-recipe closure reaches `thisRecipeId` (UC15). */
  private async assertAcyclic(thisRecipeId: RecipeId, targetSubVersionId: VersionId): Promise<void> {
    const seen = new Set<VersionId>();
    const stack: VersionId[] = [targetSubVersionId];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const v = await this.repo.getVersion(id);
      if (!v) continue;
      if (v.recipeId === thisRecipeId) {
        throw new Error(`composition cycle: sub-recipe ${targetSubVersionId} already depends on recipe ${thisRecipeId}`);
      }
      for (const slot of v.content.slots) {
        if (slot.resolution.kind === "sub_recipe") stack.push(slot.resolution.subRecipeVersionId);
      }
    }
  }
}
