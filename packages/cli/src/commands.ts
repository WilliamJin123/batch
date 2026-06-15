import { scale as scaleContent, currentVerdicts } from "@batch/core";
import type {
  Author, CompareView, CurrentVerdicts, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient, Macros,
  MacroSnapshot, OverrideEntry, Rating, RebaseConflict, RebaseResult, Recipe, RecipeContent, RecipeService,
  RecipeVersion, VersionStatus, Yield,
} from "@batch/core";

export interface CreateInput {
  name: string; description?: string; tags?: string[];
  yield: Yield; content: RecipeContent; author?: Author; commitMessage?: string;
  parents?: string[]; rationale?: string; // CM-7
}
export function create(svc: RecipeService, input: CreateInput): Promise<{ recipe: Recipe; version: RecipeVersion }> {
  return svc.createRecipe(input);
}

export function derive(
  svc: RecipeService, input: { baseVersionId: string; name: string; commitMessage?: string },
): Promise<{ recipe: Recipe; version: RecipeVersion }> {
  return svc.deriveVariant(input);
}

export function override(
  svc: RecipeService, input: { versionId: string; entry: OverrideEntry; message?: string },
): Promise<{ version: RecipeVersion }> {
  return svc.applyOverride({ versionId: input.versionId, entry: input.entry, commitMessage: input.message });
}

export interface EditPatch {
  name?: string; description?: string; tags?: string[]; yield?: Yield; status?: VersionStatus;
}
export function edit(
  svc: RecipeService, input: { versionId: string; patch: EditPatch; message?: string },
): Promise<{ version: RecipeVersion }> {
  return svc.editMetadata({ versionId: input.versionId, patch: input.patch, commitMessage: input.message });
}

export interface ViewOpts { structure?: boolean }
/** A sub_recipe pin surfaced in `--structure` view, annotated with how far behind its child's head it is. */
export interface StructurePin { slotKey: string; versionId: string; behind: number }

export async function show(
  svc: RecipeService, versionId: string, opts: ViewOpts = {},
): Promise<RecipeVersion & { sources?: FlattenSource[]; pins?: StructurePin[] }> {
  const version = await svc.getVersion(versionId);
  if (opts.structure) {
    // Stored composed content (sub_recipe pins intact), each pin annotated with its staleness.
    const pins: StructurePin[] = [];
    for (const slot of version.content.slots) {
      if (slot.resolution.kind !== "sub_recipe") continue;
      const subId = slot.resolution.subRecipeVersionId;
      pins.push({ slotKey: slot.componentKey, versionId: subId, behind: await svc.staleness(subId) });
    }
    return pins.length ? { ...version, pins } : version;
  }
  const { content, sources } = await svc.flatten(versionId);
  return { ...version, content, sources };
}

export async function resolve(
  svc: RecipeService, versionId: string, opts: ViewOpts = {},
): Promise<RecipeContent> {
  if (opts.structure) return svc.resolve(versionId);
  return (await svc.flatten(versionId)).content;
}

export async function scale(svc: RecipeService, versionId: string, to: number): Promise<RecipeContent> {
  const v = await svc.getVersion(versionId);
  return scaleContent(v.content, v.yield, to);
}

export function history(svc: RecipeService, versionId: string): Promise<RecipeVersion[]> {
  return svc.getHistory(versionId);
}

// --- macros & the ingredient library (M2) ---

export interface IngredientInput {
  id?: string;
  name: string;
  aliases?: string[];
  brand?: string;
  macrosPer100g: Macros;
  densityGPerMl?: number;
  unitEquivalences?: Record<string, number>;
  notes?: string;
  source?: "user" | "usda";
  usdaFdcId?: string;
}
function slugify(name: string): string {
  return "ing-" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function ingredientAdd(svc: RecipeService, input: IngredientInput): Promise<LibraryIngredient> {
  return svc.addIngredient({ ...input, id: input.id ?? slugify(input.name) });
}
export function ingredientList(svc: RecipeService): Promise<LibraryIngredient[]> {
  return svc.listIngredients();
}
export async function macros(svc: RecipeService, versionId: string): Promise<MacroSnapshot | undefined> {
  return (await svc.getVersion(versionId)).macros;
}
export function recompute(svc: RecipeService, versionId: string): Promise<{ version: RecipeVersion }> {
  return svc.recomputeMacros({ versionId }); // {version} — consistent with override/edit
}

export interface ListRow {
  recipeId: string; headVersionId: string; name: string;
  status: VersionStatus; tags: string[]; isVariant: boolean;
  kcalPerServing?: number; macroBasis?: "complete" | "partial";
  tried: boolean; queued: boolean; verdict?: Rating;
}
export interface ListOpts { toMake?: boolean }
export async function list(svc: RecipeService, opts: ListOpts = {}): Promise<ListRow[]> {
  const recipes = await svc.listRecipes();
  const summary = await svc.feedbackSummary();
  const rows = await Promise.all(recipes.map(async (r): Promise<ListRow> => {
    const v = await svc.getVersion(r.headVersionId);
    const fb = summary[r.id] ?? { tried: false, queued: false };
    return {
      recipeId: r.id, headVersionId: v.id, name: v.name,
      status: v.status, tags: v.tags, isVariant: v.derivesFromVersionId !== undefined,
      kcalPerServing: v.macros?.perServing.calories, macroBasis: v.macros?.basis,
      tried: fb.tried, queued: fb.queued, ...(fb.verdict ? { verdict: fb.verdict } : {}),
    };
  }));
  const filtered = opts.toMake ? rows.filter((row) => row.queued) : rows;
  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

export interface TreeNode {
  versionId: string; recipeId: string; name: string;
  derivesFromVersionId?: string; prevVersionId?: string;
  parentVersionIds?: string[];
}
export async function tree(svc: RecipeService): Promise<TreeNode[]> {
  const versions = await svc.listVersions();
  return versions.map((v) => ({
    versionId: v.id, recipeId: v.recipeId, name: v.name,
    derivesFromVersionId: v.derivesFromVersionId, prevVersionId: v.prevVersionId,
    ...(v.parentVersionIds ? { parentVersionIds: v.parentVersionIds } : {}),
  }));
}

export function compare(svc: RecipeService, versionIds: string[]): Promise<CompareView> {
  return svc.compare(versionIds);
}

export function rebase(
  svc: RecipeService, input: { variantVersionId: string; ontoVersionId: string; message?: string },
): Promise<RebaseResult> {
  return svc.rebase({ variantVersionId: input.variantVersionId, ontoVersionId: input.ontoVersionId, commitMessage: input.message });
}

export function rebaseAll(
  svc: RecipeService, baseVersionId: string, message?: string,
): Promise<{ results: Array<{ recipeId: string; version: RecipeVersion; conflicts: RebaseConflict[] }> }> {
  return svc.rebaseVariants({ baseVersionId, commitMessage: message });
}

// --- feedback (tasting log) ---

export interface FeedbackInput {
  versionId: string;
  kind: FeedbackKind;
  rating?: Rating;
  component?: string;
  notes?: string;
  date?: string;
}
export function feedback(svc: RecipeService, input: FeedbackInput): Promise<FeedbackEntry> {
  return svc.addFeedback({
    versionId: input.versionId,
    kind: input.kind,
    rating: input.rating,
    componentKey: input.component,
    notes: input.notes,
    date: input.date,
  });
}

export interface FeedbackView {
  recipeId: string;
  current: CurrentVerdicts;
  history: FeedbackEntry[];
}
export async function feedbackList(svc: RecipeService, versionId: string): Promise<FeedbackView> {
  const version = await svc.getVersion(versionId);
  const history = await svc.feedbackForRecipe(version.recipeId);
  return { recipeId: version.recipeId, current: currentVerdicts(history), history };
}

export function feedbackRemove(svc: RecipeService, id: string): Promise<void> {
  return svc.deleteFeedback(id);
}
