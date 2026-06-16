import { scale as scaleContent, currentVerdicts, renderCard } from "@batch/core";
import type {
  Author, CompareView, CurrentVerdicts, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient, Macros,
  MacroSnapshot, OverrideEntry, Rating, RebaseResult, RebaseVariantItem, Recipe, RecipeContent, RecipeService,
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

export async function derive(
  svc: RecipeService, input: { baseVersionId: string; name: string; commitMessage?: string },
): Promise<{ recipe: Recipe; version: RecipeVersion }> {
  const baseVersionId = await svc.resolveRef(input.baseVersionId);
  return svc.deriveVariant({ ...input, baseVersionId });
}

export async function override(
  svc: RecipeService, input: { versionId: string; entry: OverrideEntry; message?: string },
): Promise<{ version: RecipeVersion }> {
  const versionId = await svc.resolveRef(input.versionId);
  return svc.applyOverride({ versionId, entry: input.entry, commitMessage: input.message });
}

export interface EditPatch {
  name?: string; description?: string; tags?: string[]; yield?: Yield; status?: VersionStatus;
}
export async function edit(
  svc: RecipeService, input: { versionId: string; patch: EditPatch; message?: string },
): Promise<{ version: RecipeVersion }> {
  const versionId = await svc.resolveRef(input.versionId);
  return svc.editMetadata({ versionId, patch: input.patch, commitMessage: input.message });
}

export interface ViewOpts { structure?: boolean }
/** A sub_recipe pin surfaced in `--structure` view, annotated with how far behind its child's head it is. */
export interface StructurePin { slotKey: string; versionId: string; behind: number }

export async function show(
  svc: RecipeService, ref: string, opts: ViewOpts = {},
): Promise<RecipeVersion & { sources?: FlattenSource[]; pins?: StructurePin[] }> {
  const versionId = await svc.resolveRef(ref);
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
  svc: RecipeService, ref: string, opts: ViewOpts = {},
): Promise<RecipeContent> {
  const versionId = await svc.resolveRef(ref);
  if (opts.structure) return svc.resolve(versionId);
  return (await svc.flatten(versionId)).content;
}

export async function scale(svc: RecipeService, ref: string, to: number): Promise<RecipeContent> {
  const v = await svc.getVersion(await svc.resolveRef(ref));
  return scaleContent(v.content, v.yield, to);
}

export async function history(svc: RecipeService, ref: string): Promise<RecipeVersion[]> {
  return svc.getHistory(await svc.resolveRef(ref));
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
export function ingredientShow(svc: RecipeService, ref: string): Promise<LibraryIngredient> {
  return svc.getIngredientRef(ref);
}
export async function macros(svc: RecipeService, ref: string): Promise<MacroSnapshot | undefined> {
  return (await svc.getVersion(await svc.resolveRef(ref))).macros;
}
export async function macrosBySection(
  svc: RecipeService, ref: string,
): Promise<{ snapshot: MacroSnapshot; bySection: Record<string, Macros> }> {
  return svc.macrosBySection(await svc.resolveRef(ref));
}
export async function recompute(svc: RecipeService, ref: string): Promise<{ version: RecipeVersion }> {
  return svc.recomputeMacros({ versionId: await svc.resolveRef(ref) }); // {version} — consistent with override/edit
}

export interface ExportOpts { format?: "md" | "json" }
export async function exportRecipe(
  svc: RecipeService, ref: string, opts: ExportOpts = {},
): Promise<string | { content: RecipeContent; macros: MacroSnapshot }> {
  const { version, content, macros } = await svc.exportCard(await svc.resolveRef(ref));
  if (opts.format === "json") return { content, macros };
  return renderCard({ name: version.name, description: version.description, yield: version.yield }, content, macros);
}

export interface ListRow {
  recipeId: string; headVersionId: string; name: string;
  status: VersionStatus; tags: string[]; isVariant: boolean;
  kcalPerServing?: number; macroBasis?: "complete" | "partial";
  tried: boolean; queued: boolean; verdict?: Rating;
}
export interface ListOpts { toMake?: boolean; tag?: string; name?: string }
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
  let filtered = opts.toMake ? rows.filter((row) => row.queued) : rows;
  if (opts.tag) {
    const t = opts.tag.toLowerCase();
    filtered = filtered.filter((row) => row.tags.some((x) => x.toLowerCase() === t));
  }
  if (opts.name) {
    const n = opts.name.toLowerCase();
    filtered = filtered.filter((row) => row.name.toLowerCase().includes(n));
  }
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

export async function compare(svc: RecipeService, refs: string[]): Promise<CompareView> {
  const versionIds = await Promise.all(refs.map((r) => svc.resolveRef(r)));
  return svc.compare(versionIds);
}

export async function rebase(
  svc: RecipeService, input: { variantVersionId: string; ontoVersionId: string; message?: string },
): Promise<RebaseResult> {
  const [variantVersionId, ontoVersionId] = await Promise.all([
    svc.resolveRef(input.variantVersionId), svc.resolveRef(input.ontoVersionId),
  ]);
  return svc.rebase({ variantVersionId, ontoVersionId, commitMessage: input.message });
}

export async function rebaseAll(
  svc: RecipeService, baseVersionId: string, message?: string,
): Promise<{ results: RebaseVariantItem[] }> {
  return svc.rebaseVariants({ baseVersionId: await svc.resolveRef(baseVersionId), commitMessage: message });
}

export async function promote(
  svc: RecipeService,
  input: { targetVersionId: string; sourceVersionId: string; componentKeys: string[]; message?: string },
): Promise<{ version: RecipeVersion }> {
  const [targetVersionId, sourceVersionId] = await Promise.all([
    svc.resolveRef(input.targetVersionId), svc.resolveRef(input.sourceVersionId),
  ]);
  return svc.promote({
    targetVersionId, sourceVersionId,
    componentKeys: input.componentKeys, commitMessage: input.message,
  });
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
export async function feedback(svc: RecipeService, input: FeedbackInput): Promise<FeedbackEntry> {
  return svc.addFeedback({
    versionId: await svc.resolveRef(input.versionId),
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
export async function feedbackList(svc: RecipeService, ref: string): Promise<FeedbackView> {
  const version = await svc.getVersion(await svc.resolveRef(ref));
  const history = await svc.feedbackForRecipe(version.recipeId);
  return { recipeId: version.recipeId, current: currentVerdicts(history), history };
}

export function feedbackRemove(svc: RecipeService, id: string): Promise<void> {
  return svc.deleteFeedback(id);
}
