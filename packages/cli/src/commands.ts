import { scale as scaleContent } from "@batch/core";
import type {
  Author, LibraryIngredient, Macros, MacroSnapshot, OverrideEntry, Recipe, RecipeContent,
  RecipeService, RecipeVersion, VersionStatus, Yield,
} from "@batch/core";

export interface CreateInput {
  name: string; description?: string; tags?: string[];
  yield: Yield; content: RecipeContent; author?: Author; commitMessage?: string;
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

export function show(svc: RecipeService, versionId: string): Promise<RecipeVersion> {
  return svc.getVersion(versionId);
}

export function resolve(svc: RecipeService, versionId: string): Promise<RecipeContent> {
  return svc.resolve(versionId);
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
}
export async function list(svc: RecipeService): Promise<ListRow[]> {
  const recipes = await svc.listRecipes();
  const rows = await Promise.all(recipes.map(async (r): Promise<ListRow> => {
    const v = await svc.getVersion(r.headVersionId);
    return {
      recipeId: r.id, headVersionId: v.id, name: v.name,
      status: v.status, tags: v.tags, isVariant: v.derivesFromVersionId !== undefined,
      kcalPerServing: v.macros?.perServing.calories, macroBasis: v.macros?.basis,
    };
  }));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface TreeNode {
  versionId: string; recipeId: string; name: string;
  derivesFromVersionId?: string; prevVersionId?: string;
}
export async function tree(svc: RecipeService): Promise<TreeNode[]> {
  const versions = await svc.listVersions();
  return versions.map((v) => ({
    versionId: v.id, recipeId: v.recipeId, name: v.name,
    derivesFromVersionId: v.derivesFromVersionId, prevVersionId: v.prevVersionId,
  }));
}
