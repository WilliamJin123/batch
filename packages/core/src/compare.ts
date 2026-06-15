import type {
  ComponentKey, FeedbackEntry, LibraryIngredient, Macros, Rating, RecipeContent, RecipeId, VersionId, Yield,
} from "./types.js";
import { toGrams } from "./units.js";
import { summarizeRecipe, currentVerdicts } from "./feedback.js";

/** One version's inputs to the compare matrix. `content` is the FLATTENED content (raw slots only). */
export interface CompareInput {
  versionId: VersionId; recipeId: RecipeId; name: string; isVariant: boolean;
  yield: Yield; perServing: Macros; macroBasis: "complete" | "partial";
  content: RecipeContent;
  feedback: FeedbackEntry[];
}
export interface CompareColumn {
  versionId: VersionId; recipeId: RecipeId; name: string; isVariant: boolean;
  perServing: Macros; macroBasis: "complete" | "partial";
  verdict?: Rating; componentVerdicts: Record<ComponentKey, Rating>;
}
export interface CompareIngredientRow {
  ingredientId: string; name: string;
  /**
   * grams per serving | "present" | null (absent) — CM-2.
   * `"present"` means the ingredient is used but no honest gram figure exists for it:
   * any usage was unconvertible to grams, the library ingredient is unknown, or the
   * yield is non-positive. We never emit a partial sum that silently drops a usage.
   */
  perServingGrams: Record<VersionId, number | "present" | null>;
}
export interface CompareStepList {
  versionId: VersionId; steps: Array<{ order: number; section?: string; text: string }>;
}
export interface CompareView {
  columns: CompareColumn[]; ingredients: CompareIngredientRow[]; steps: CompareStepList[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Build the compare view-model: ingredient matrix joined by library-ingredient-id, macros + verdicts per column. */
export function buildCompareView(
  inputs: CompareInput[], ingredients: Map<string, LibraryIngredient>,
): CompareView {
  type IngAcc = { grams: number; quantified: boolean; hasUnconvertible: boolean };
  const perVersion = new Map<VersionId, Map<string, IngAcc>>();
  const allIngIds = new Set<string>();
  for (const inp of inputs) {
    const slotByKey = new Map(inp.content.slots.map((s) => [s.componentKey, s]));
    const acc = new Map<string, IngAcc>();
    for (const u of inp.content.usages) {
      const slot = slotByKey.get(u.slotKey);
      if (!slot || slot.resolution.kind !== "raw") continue;
      const ingId = slot.resolution.libraryIngredientId;
      allIngIds.add(ingId);
      const rec = acc.get(ingId) ?? { grams: 0, quantified: false, hasUnconvertible: false };
      const ing = ingredients.get(ingId);
      const g = ing ? toGrams(u.quantityValue, u.quantityUnit, ing) : undefined;
      if (g && "grams" in g) { rec.grams += g.grams; rec.quantified = true; }
      else { rec.hasUnconvertible = true; } // unknown ingredient or unconvertible unit
      acc.set(ingId, rec);
    }
    perVersion.set(inp.versionId, acc);
  }

  const rows: CompareIngredientRow[] = [...allIngIds].map((ingId) => {
    const perServingGrams: Record<VersionId, number | "present" | null> = {};
    for (const inp of inputs) {
      const rec = perVersion.get(inp.versionId)!.get(ingId);
      if (!rec) { perServingGrams[inp.versionId] = null; continue; }
      // A number only when EVERY usage converted and the yield is positive — never a partial sum.
      perServingGrams[inp.versionId] =
        rec.quantified && !rec.hasUnconvertible && inp.yield.amount > 0
          ? round2(rec.grams / inp.yield.amount)
          : "present";
    }
    return { ingredientId: ingId, name: ingredients.get(ingId)?.name ?? ingId, perServingGrams };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const columns: CompareColumn[] = inputs.map((inp) => {
    const summary = summarizeRecipe(inp.feedback);
    const cv = currentVerdicts(inp.feedback);
    const componentVerdicts: Record<ComponentKey, Rating> = {};
    for (const [key, entry] of Object.entries(cv.components)) {
      if (entry.rating) componentVerdicts[key] = entry.rating;
    }
    return {
      versionId: inp.versionId, recipeId: inp.recipeId, name: inp.name, isVariant: inp.isVariant,
      perServing: inp.perServing, macroBasis: inp.macroBasis,
      ...(summary.verdict ? { verdict: summary.verdict } : {}),
      componentVerdicts,
    };
  });

  const steps: CompareStepList[] = inputs.map((inp) => ({
    versionId: inp.versionId,
    steps: [...inp.content.steps].sort((a, b) => a.order - b.order)
      .map((s) => ({ order: s.order, ...(s.section ? { section: s.section } : {}), text: s.instructionText })),
  }));

  return { columns, ingredients: rows, steps };
}
