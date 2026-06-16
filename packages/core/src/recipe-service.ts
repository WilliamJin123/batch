import type {
  Author, ComponentKey, FeedbackBase, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient,
  MacroLine, Macros, MacroSnapshot, OverrideEntry, OverrideSet, Rating, Recipe, RecipeContent, RecipeId,
  RecipeVersion, StepUsage, SubRecipeMacro, VersionId, VersionStatus, Yield,
} from "./types.js";
import type { Repository } from "./repository.js";
import type { Deps } from "./deps.js";
import { materialize } from "./materialize.js";
import { computeMacros } from "./compute-macros.js";
import { flattenContent, type SubContent } from "./flatten.js";
import { buildCompareView, type CompareInput, type CompareView } from "./compare.js";
import { summarizeFeedback, latestFirst, type RecipeFeedbackSummary } from "./feedback.js";
import { buildRebasePlan, type RebaseConflict } from "./rebase.js";

function sumLineGrams(lines: MacroLine[]): number {
  return lines.reduce((g, l) => g + (l.grams ?? 0), 0);
}

const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const round2 = (n: number): number => Math.round(n * 100) / 100;
function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: round2(a.calories + b.calories), protein: round2(a.protein + b.protein),
    carbs: round2(a.carbs + b.carbs), fat: round2(a.fat + b.fat), fiber: round2(a.fiber + b.fiber),
  };
}

export interface RebaseResult { version: RecipeVersion; conflicts: RebaseConflict[]; }
export interface RebaseVariantItem extends RebaseResult { recipeId: RecipeId; }

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

  /**
   * Resolve a user-supplied reference to a version id. Tries, in order: an exact
   * version id, an exact recipe name (case-insensitive) → its head, then a unique
   * version-id prefix (≥6 chars). Ambiguity or no match throws with the candidates,
   * so a name never silently resolves to the wrong recipe.
   */
  async resolveRef(ref: string): Promise<VersionId> {
    const trimmed = ref.trim();
    if (!trimmed) throw new Error("empty recipe reference");
    if (await this.repo.getVersion(trimmed)) return trimmed;

    const versions = await this.repo.listVersions();
    const nameOf = new Map(versions.map((v) => [v.id, v.name] as const));
    const recipes = await this.repo.listRecipes();
    const byName = recipes.filter((r) => (nameOf.get(r.headVersionId) ?? "").toLowerCase() === trimmed.toLowerCase());
    if (byName.length === 1) return byName[0]!.headVersionId;
    if (byName.length > 1) {
      const cands = byName.map((r) => `${nameOf.get(r.headVersionId)} (${r.headVersionId})`).join(", ");
      throw new Error(`ambiguous name "${ref}" matches multiple recipes: ${cands}`);
    }

    if (trimmed.length >= 6) {
      const hits = versions.filter((v) => v.id.startsWith(trimmed));
      if (hits.length === 1) return hits[0]!.id;
      if (hits.length > 1) throw new Error(`ambiguous id prefix "${ref}" matches ${hits.length} versions`);
    }
    throw new Error(`no recipe or version matches "${ref}"`);
  }

  /** Resolve an ingredient by exact id, then case-insensitive name or alias. Throws if nothing matches. */
  async getIngredientRef(ref: string): Promise<LibraryIngredient> {
    const byId = await this.repo.getIngredient(ref);
    if (byId) return byId;
    const lc = ref.trim().toLowerCase();
    const hit = (await this.repo.listIngredients()).find(
      (i) => i.name.toLowerCase() === lc || (i.aliases ?? []).some((a) => a.toLowerCase() === lc),
    );
    if (!hit) throw new Error(`no ingredient matches "${ref}"`);
    return hit;
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

  /**
   * Macros broken down by recipe section (Crust / Topping / a sub-recipe's name / …).
   * Computed on the flattened content — sections only exist after flatten — by attributing
   * each usage's contribution to the section of the step that uses it. Section totals sum to `snapshot.total`.
   */
  async macrosBySection(versionId: VersionId): Promise<{ snapshot: MacroSnapshot; bySection: Record<string, Macros> }> {
    const version = await this.getVersion(versionId);
    const { content } = await this.flatten(versionId);
    const snapshot = await this.macrosFor(content, version.yield);
    const sectionOfStep = new Map(content.steps.map((s) => [s.componentKey, s.section ?? "Base"] as const));
    const bySection: Record<string, Macros> = {};
    content.usages.forEach((usage, i) => {
      const line = snapshot.lines[i];
      if (!line || line.status !== "ok" || !line.macros) return;
      const section = sectionOfStep.get(usage.stepKey) ?? "Base";
      bySection[section] = addMacros(bySection[section] ?? ZERO_MACROS, line.macros);
    });
    return { snapshot, bySection };
  }

  /** Gather what a card renderer needs: version metadata, flattened content, and a fresh macro snapshot. */
  async exportCard(versionId: VersionId): Promise<{ version: RecipeVersion; content: RecipeContent; macros: MacroSnapshot }> {
    const version = await this.getVersion(versionId);
    const { content } = await this.flatten(versionId);
    const macros = await this.macrosFor(content, version.yield);
    return { version, content, macros };
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
    const allFeedback = await this.repo.listFeedback(); // fetch once, filter per version (avoid N full scans)
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
        feedback: latestFirst(allFeedback.filter((e) => e.recipeId === v.recipeId)),
      });
    }
    return buildCompareView(inputs, ingredients);
  }

  /** Re-point a variant onto an improved version of its own base (CM-5). Variant-wins + conflicts[]. */
  async rebase(input: {
    variantVersionId: VersionId; ontoVersionId: VersionId; author?: Author; commitMessage?: string;
  }): Promise<RebaseResult> {
    const variant = await this.getVersion(input.variantVersionId);
    if (!variant.derivesFromVersionId || !variant.overrideSet) {
      throw new Error(`${input.variantVersionId} is not a variant; nothing to rebase`);
    }
    const baseOld = await this.getVersion(variant.derivesFromVersionId);
    const onto = await this.getVersion(input.ontoVersionId);
    if (onto.recipeId !== baseOld.recipeId) {
      throw new Error(
        `cannot rebase across lineages: ${input.ontoVersionId} is not a version of base recipe ` +
        `${baseOld.recipeId} — use compare + derive + override to converge unrelated recipes`);
    }
    const plan = buildRebasePlan(baseOld.content, onto.content, variant.overrideSet);
    const content = materialize(onto.content, plan.overrideSet);
    for (const slot of content.slots) {
      if (slot.resolution.kind === "sub_recipe") {
        await this.assertAcyclic(variant.recipeId, slot.resolution.subRecipeVersionId);
      }
    }
    const macros = await this.macrosFor(content, variant.yield);
    const version: RecipeVersion = {
      ...variant,
      id: this.deps.newId(),
      prevVersionId: variant.id,
      derivesFromVersionId: onto.id,
      overrideSet: plan.overrideSet,
      content,
      macros,
      author: input.author ?? variant.author,
      commitMessage: input.commitMessage ?? `rebase onto ${onto.id}`,
      status: "draft",
      createdAt: this.deps.now(),
      // A rebased version has a single derivation lineage (derivesFromVersionId), not
      // multi-parent amalgam provenance — don't let a champion variant's CM-7 metadata leak in.
      parentVersionIds: undefined,
      provenanceNote: undefined,
    };
    await this.repo.saveVersion(version);
    await this.repo.setHead(version.recipeId, version.id);
    return { version, conflicts: plan.conflicts };
  }

  /** Rebase every variant of a base recipe onto that base's head (CM-8) — the easy-propagate path. */
  async rebaseVariants(input: {
    baseVersionId: VersionId; author?: Author; commitMessage?: string;
  }): Promise<{ results: RebaseVariantItem[] }> {
    const base = await this.getVersion(input.baseVersionId);
    const baseRecipe = await this.getRecipe(base.recipeId);
    const ontoId = baseRecipe.headVersionId;
    const results: RebaseVariantItem[] = [];
    for (const r of await this.repo.listRecipes()) {
      if (r.id === base.recipeId) continue;
      const head = await this.repo.getVersion(r.headVersionId);
      if (!head?.derivesFromVersionId) continue;
      const headBase = await this.repo.getVersion(head.derivesFromVersionId);
      if (headBase?.recipeId !== base.recipeId) continue;
      const res = await this.rebase({
        variantVersionId: head.id, ontoVersionId: ontoId,
        author: input.author, commitMessage: input.commitMessage,
      });
      results.push({ recipeId: r.id, version: res.version, conflicts: res.conflicts });
    }
    return { results };
  }

  /**
   * Bake component(s) from a source version into a target (CM-4) — thin sugar over applyOverride.
   * Promoting a slot also lifts the usages that reference it (so no ingredient is left dangling).
   * Each lifted component is one override (add if the target lacks the key, else replace).
   */
  async promote(input: {
    targetVersionId: VersionId; sourceVersionId: VersionId; componentKeys: ComponentKey[];
    author?: Author; commitMessage?: string;
  }): Promise<{ version: RecipeVersion }> {
    const source = await this.getVersion(input.sourceVersionId);
    const sc = source.content;
    const toLift: Array<{ kind: "step" | "slot" | "usage"; key: ComponentKey }> = [];
    const seen = new Set<string>();
    const add = (kind: "step" | "slot" | "usage", key: ComponentKey): void => {
      const id = `${kind}:${key}`;
      if (!seen.has(id)) { seen.add(id); toLift.push({ kind, key }); }
    };
    for (const key of input.componentKeys) {
      if (sc.steps.some((x) => x.componentKey === key)) add("step", key);
      else if (sc.slots.some((x) => x.componentKey === key)) {
        add("slot", key);
        for (const u of sc.usages) if (u.slotKey === key) add("usage", u.componentKey);
      } else if (sc.usages.some((x) => x.componentKey === key)) add("usage", key);
      else throw new Error(`component not found in source ${input.sourceVersionId}: ${key}`);
    }

    let targetId = input.targetVersionId;
    for (const { kind, key } of toLift) {
      const target = await this.getVersion(targetId);
      const payload =
        kind === "step" ? sc.steps.find((x) => x.componentKey === key)!
        : kind === "slot" ? sc.slots.find((x) => x.componentKey === key)!
        : sc.usages.find((x) => x.componentKey === key)!;
      if (kind === "usage") {
        const su = payload as StepUsage;
        const stepPresent = target.content.steps.some((x) => x.componentKey === su.stepKey) || toLift.some((t) => t.kind === "step" && t.key === su.stepKey);
        if (!stepPresent) throw new Error(`usage ${key} references step ${su.stepKey} missing in target ${targetId}`);
        const slotPresent = target.content.slots.some((x) => x.componentKey === su.slotKey) || toLift.some((t) => t.kind === "slot" && t.key === su.slotKey);
        if (!slotPresent) throw new Error(`usage ${key} references slot ${su.slotKey} missing in target ${targetId}`);
      }
      const arr = kind === "step" ? target.content.steps : kind === "slot" ? target.content.slots : target.content.usages;
      const exists = arr.some((x) => x.componentKey === key);
      const entry: OverrideEntry = exists
        ? ({ op: "replace", kind, target: key, payload } as OverrideEntry)
        : ({ op: "add", kind, payload } as OverrideEntry);
      const { version } = await this.applyOverride({
        versionId: targetId, entry, author: input.author,
        commitMessage: input.commitMessage ?? `promote ${key} from ${input.sourceVersionId}`,
      });
      targetId = version.id;
    }
    return { version: await this.getVersion(targetId) };
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
