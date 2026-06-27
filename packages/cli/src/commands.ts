import { scale as scaleContent, currentVerdicts, renderCard, classifyKinds, diffContent, ingestMarkdown } from "@batch/core";
import type {
  Author, CompareView, CurrentVerdicts, FeedbackEntry, FeedbackKind, FlattenSource, IngestResult, IngredientSlot, LibraryIngredient,
  Macros, MacroSnapshot, OverrideEntry, Rating, RebaseResult, RebaseVariantItem, Recipe, RecipeContent, RecipeKind,
  RecipeService, RecipeVersion, VersionStatus, Yield,
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

/** Apply one or many override entries atomically (one commit). A single-element array behaves like {@link override}. */
export async function applyOverrides(
  svc: RecipeService, input: { versionId: string; entries: OverrideEntry[]; message?: string },
): Promise<{ version: RecipeVersion }> {
  const versionId = await svc.resolveRef(input.versionId);
  return svc.applyOverrides({ versionId, entries: input.entries, commitMessage: input.message });
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

export interface IngredientPatch {
  name?: string; aliases?: string[]; brand?: string; notes?: string;
  densityGPerMl?: number;
  macrosPer100g?: Partial<Macros>;          // merged onto existing macros (set one field without resending all)
  unitEquivalences?: Record<string, number>; // merged onto existing (e.g. bump `each` 44→50, keep the rest)
}
/**
 * Patch an existing library ingredient in place (resolved by id/name/alias). Scalar fields replace;
 * `macrosPer100g` and `unitEquivalences` MERGE so you can bump a single value (e.g. `each` 44→50)
 * without re-sending the whole ingredient JSON. The catalog-edit ergonomic that `ingredient add`
 * (full-object upsert) lacked.
 */
export async function ingredientSet(
  svc: RecipeService, ref: string, patch: IngredientPatch,
): Promise<LibraryIngredient> {
  const cur = await svc.getIngredientRef(ref);
  const merged: LibraryIngredient = {
    ...cur,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.aliases !== undefined ? { aliases: patch.aliases } : {}),
    ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.densityGPerMl !== undefined ? { densityGPerMl: patch.densityGPerMl } : {}),
    ...(patch.macrosPer100g ? { macrosPer100g: { ...cur.macrosPer100g, ...patch.macrosPer100g } } : {}),
    ...(patch.unitEquivalences
      ? { unitEquivalences: { ...(cur.unitEquivalences ?? {}), ...patch.unitEquivalences } }
      : {}),
  };
  return svc.addIngredient(merged);
}
export function ingredientList(svc: RecipeService): Promise<LibraryIngredient[]> {
  return svc.listIngredients();
}
export function ingredientShow(svc: RecipeService, ref: string): Promise<LibraryIngredient> {
  return svc.getIngredientRef(ref);
}
/** Parse a recipe markdown document into a draft `create` payload, matched against the live library. */
export async function ingest(svc: RecipeService, markdown: string): Promise<IngestResult> {
  return ingestMarkdown(markdown, await svc.listIngredients());
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
  const ings = await svc.listIngredients();
  const unitInfo = new Map(ings.map((i) => [i.id, { densityGPerMl: i.densityGPerMl, unitEquivalences: i.unitEquivalences }] as const));
  return renderCard({ name: version.name, description: version.description, yield: version.yield }, content, macros, unitInfo);
}

export interface ListRow {
  recipeId: string; headVersionId: string; name: string;
  status: VersionStatus; tags: string[]; isVariant: boolean; kind: RecipeKind;
  kcalPerServing?: number; macroBasis?: "complete" | "partial";
  tried: boolean; queued: boolean; verdict?: Rating;
}
export interface ListOpts { toMake?: boolean; tag?: string; name?: string; kind?: RecipeKind }
export async function list(svc: RecipeService, opts: ListOpts = {}): Promise<ListRow[]> {
  const recipes = await svc.listRecipes();
  const summary = await svc.feedbackSummary();
  const heads = await Promise.all(recipes.map((r) => svc.getVersion(r.headVersionId)));
  const recipeIdOf = new Map((await svc.listVersions()).map((v) => [v.id, v.recipeId]));
  const kinds = classifyKinds(heads, recipeIdOf); // "is this a base?" needs the whole forest — compute once
  const rows: ListRow[] = heads.map((v) => {
    const fb = summary[v.recipeId] ?? { tried: false, queued: false };
    return {
      recipeId: v.recipeId, headVersionId: v.id, name: v.name,
      status: v.status, tags: v.tags, isVariant: v.derivesFromVersionId !== undefined, kind: kinds.get(v.recipeId)!,
      kcalPerServing: v.macros?.perServing.calories, macroBasis: v.macros?.basis,
      tried: fb.tried, queued: fb.queued, ...(fb.verdict ? { verdict: fb.verdict } : {}),
    };
  });
  let filtered = opts.toMake ? rows.filter((row) => row.queued) : rows;
  if (opts.tag) {
    const t = opts.tag.toLowerCase();
    filtered = filtered.filter((row) => row.tags.some((x) => x.toLowerCase() === t));
  }
  if (opts.name) {
    const n = opts.name.toLowerCase();
    filtered = filtered.filter((row) => row.name.toLowerCase().includes(n));
  }
  if (opts.kind) filtered = filtered.filter((row) => row.kind === opts.kind);
  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

// ----- dump / import: regenerate declarative sources FROM the live store, and replay them back -----

export interface DumpFile { path: string; json: unknown }
export interface DumpResult { files: DumpFile[]; recipes: number; ingredients: number; feedback: number }

function recipeSlug(name: string, used: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recipe";
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  return s;
}

/** Dependency-ordered recipe names: a base before its variants, a sub-recipe before any composer. */
function buildOrder(heads: RecipeVersion[], recipeIdOf: Map<string, string>, nameOf: Map<string, string>): string[] {
  const ids = new Set(heads.map((v) => v.recipeId));
  const deps = new Map<string, Set<string>>();
  for (const v of heads) {
    const d = new Set<string>();
    if (v.derivesFromVersionId) { const b = recipeIdOf.get(v.derivesFromVersionId); if (b && ids.has(b)) d.add(b); }
    for (const sl of v.content.slots) if (sl.resolution.kind === "sub_recipe") {
      const c = recipeIdOf.get(sl.resolution.subRecipeVersionId); if (c && ids.has(c) && c !== v.recipeId) d.add(c);
    }
    deps.set(v.recipeId, d);
  }
  const order: string[] = [], done = new Set<string>(), remaining = new Set(ids);
  const byName = (a: string, b: string) => nameOf.get(a)!.localeCompare(nameOf.get(b)!);
  while (remaining.size) {
    const ready = [...remaining].filter((id) => [...deps.get(id)!].every((x) => done.has(x))).sort(byName);
    const batch = ready.length ? ready : [...remaining].sort(byName); // cycle guard (unreachable: forest + acyclic pins)
    for (const id of batch) { order.push(nameOf.get(id)!); done.add(id); remaining.delete(id); }
  }
  return order;
}

/**
 * Regenerate the declarative `sources/` set FROM the live store: the full ingredient library, one
 * file per recipe (a `create` payload for a root, a `derive`+auto-diffed-`overrides` manifest for a
 * variant), the tasting log, and a dependency-ordered manifest. Sub-recipe pins are rewritten to
 * by-NAME refs so they re-resolve against a freshly rebuilt store. The inverse of `importDump`; it
 * keeps `sources/` from drifting (it's derived, never hand-maintained). Pure read — no file I/O here.
 */
export async function dump(svc: RecipeService): Promise<DumpResult> {
  const recipes = await svc.listRecipes();
  const versions = await svc.listVersions();
  const recipeIdOf = new Map(versions.map((v) => [v.id, v.recipeId]));
  const heads = await Promise.all(recipes.map((r) => svc.getVersion(r.headVersionId)));
  const headByRecipe = new Map(heads.map((v) => [v.recipeId, v]));
  const nameOf = new Map(heads.map((v) => [v.recipeId, v.name]));

  // a sub_recipe pin → the child recipe's current name, so the ref re-resolves after a rebuild
  const refOf = (vid: string): string | undefined => nameOf.get(recipeIdOf.get(vid) ?? "");
  const portableSlot = (sl: IngredientSlot): unknown =>
    sl.resolution.kind === "sub_recipe"
      ? { ...sl, resolution: { kind: "sub_recipe", subRecipeRef: refOf(sl.resolution.subRecipeVersionId) ?? sl.resolution.subRecipeVersionId } }
      : sl;
  const portableContent = (c: RecipeContent): unknown => ({ ...c, slots: c.slots.map(portableSlot) });
  const portableEntry = (e: OverrideEntry): unknown =>
    (e.op === "add" || e.op === "replace") && e.kind === "slot" ? { ...e, payload: portableSlot(e.payload) } : e;

  const ingredients = await svc.listIngredients();
  const used = new Set<string>();
  const files: DumpFile[] = [{ path: "ingredients.json", json: ingredients }];

  for (const v of [...heads].sort((a, b) => a.name.localeCompare(b.name))) {
    const meta: Record<string, unknown> = { name: v.name, ...(v.description ? { description: v.description } : {}), tags: v.tags, yield: v.yield };
    if (v.derivesFromVersionId) {
      const baseHead = headByRecipe.get(recipeIdOf.get(v.derivesFromVersionId) ?? "");
      const overrides = baseHead ? diffContent(baseHead.content, v.content).map(portableEntry) : [];
      files.push({ path: recipeSlug(v.name, used) + ".variant.json", json: { ...meta, deriveFromRecipe: baseHead?.name, overrides } });
    } else {
      files.push({ path: recipeSlug(v.name, used) + ".json", json: { ...meta, content: portableContent(v.content) } });
    }
  }

  const feedback: unknown[] = [];
  for (const r of recipes) {
    for (const e of await svc.feedbackForRecipe(r.id)) {
      feedback.push({
        recipe: nameOf.get(r.id), kind: e.kind,
        ...(e.kind === "made" && e.rating ? { rating: e.rating } : {}),
        ...(e.componentKey ? { component: e.componentKey } : {}),
        ...(e.notes ? { notes: e.notes } : {}),
        date: e.date,
      });
    }
  }
  files.push({ path: "feedback.json", json: feedback });
  files.push({ path: "manifest.json", json: {
    generatedFrom: "db", recipeCount: heads.length, ingredientCount: ingredients.length,
    buildOrder: buildOrder(heads, recipeIdOf, nameOf),
  } });

  return { files, recipes: heads.length, ingredients: ingredients.length, feedback: feedback.length };
}

async function resolveSlotRefs(svc: RecipeService, slot: any): Promise<IngredientSlot> {
  if (slot?.resolution?.kind === "sub_recipe" && slot.resolution.subRecipeRef) {
    return { ...slot, resolution: { kind: "sub_recipe", subRecipeVersionId: await svc.resolveRef(slot.resolution.subRecipeRef) } };
  }
  return slot;
}

/**
 * Replay a `dump` into a store: ingredients → recipes in dependency order (create a root, derive +
 * replay overrides + set metadata for a variant) → the tasting log. By-name sub-recipe refs resolve
 * to the freshly built child's head. The inverse of `dump`; together they are a full store round-trip
 * (and the manual core of the AI-import pipeline). Replaying into an EMPTY store is a clean rebuild.
 */
export async function importDump(svc: RecipeService, files: DumpFile[]): Promise<{ recipes: number; ingredients: number; feedback: number }> {
  const byPath = new Map(files.map((f) => [f.path, f.json]));
  const ingredients = (byPath.get("ingredients.json") as LibraryIngredient[]) ?? [];
  for (const ing of ingredients) await svc.addIngredient(ing);

  const recipeFiles = files.filter((f) => f.path.endsWith(".json") && !["ingredients.json", "feedback.json", "manifest.json"].includes(f.path));
  const byName = new Map<string, any>(recipeFiles.map((f) => [(f.json as any).name, f.json]));
  const manifest = byPath.get("manifest.json") as any;
  const order: string[] = manifest?.buildOrder?.length ? manifest.buildOrder : [...byName.keys()];

  for (const name of order) {
    const rec = byName.get(name); if (!rec) continue;
    if (rec.deriveFromRecipe) {
      const { version } = await svc.deriveVariant({ baseVersionId: await svc.resolveRef(rec.deriveFromRecipe), name: rec.name });
      let head = version.id;
      for (const entry of rec.overrides ?? []) {
        const resolved = (entry.op === "add" || entry.op === "replace") && entry.kind === "slot"
          ? { ...entry, payload: await resolveSlotRefs(svc, entry.payload) } : entry;
        head = (await svc.applyOverride({ versionId: head, entry: resolved })).version.id;
      }
      await svc.editMetadata({ versionId: head, patch: { description: rec.description, tags: rec.tags, yield: rec.yield } });
    } else {
      const slots = await Promise.all((rec.content.slots ?? []).map((s: any) => resolveSlotRefs(svc, s)));
      await svc.createRecipe({ name: rec.name, description: rec.description, tags: rec.tags, yield: rec.yield, content: { ...rec.content, slots } });
    }
  }

  const feedback = (byPath.get("feedback.json") as any[]) ?? [];
  for (const f of feedback) {
    await svc.addFeedback({ versionId: await svc.resolveRef(f.recipe), kind: f.kind, rating: f.rating, componentKey: f.component, notes: f.notes, date: f.date });
  }
  return { recipes: byName.size, ingredients: ingredients.length, feedback: feedback.length };
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
