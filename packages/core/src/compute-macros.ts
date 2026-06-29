import type {
  ComponentKey, IngredientSlot, LibraryIngredient, MacroLine, Macros, MacroSnapshot, RecipeContent, SubRecipeMacro, Yield,
} from "./types.js";
import { toGrams } from "./units.js";
import { subRecipeFraction } from "./sub-recipe.js";

const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

const round2 = (n: number): number => Math.round(n * 100) / 100;

function mapMacros(m: Macros, f: (n: number) => number): Macros {
  return { calories: f(m.calories), protein: f(m.protein), carbs: f(m.carbs), fat: f(m.fat), fiber: f(m.fiber) };
}
function zipMacros(a: Macros, b: Macros, f: (x: number, y: number) => number): Macros {
  return {
    calories: f(a.calories, b.calories), protein: f(a.protein, b.protein),
    carbs: f(a.carbs, b.carbs), fat: f(a.fat, b.fat), fiber: f(a.fiber, b.fiber),
  };
}

/**
 * Sum a recipe's macros from its usages (UC18). Each usage's quantity is
 * converted to grams (D8), then scaled as `macrosPer100g × grams / 100`. Usages
 * that can't be resolved (unknown ingredient, unconvertible unit, or a sub-recipe
 * slot) are recorded in `unresolved` and the rest still sum — this never throws,
 * so macros are useful before the ingredient library is complete.
 */
export function computeMacros(
  content: RecipeContent,
  yieldSpec: Yield,
  ingredients: Map<string, LibraryIngredient>,
  subRecipes: Map<string, SubRecipeMacro> = new Map(),
): MacroSnapshot {
  const slotByKey = new Map<ComponentKey, IngredientSlot>();
  for (const s of content.slots) slotByKey.set(s.componentKey, s);

  const lines: MacroLine[] = [];
  const unresolved: string[] = [];
  let total: Macros = { ...ZERO };

  for (const usage of content.usages) {
    const slot = slotByKey.get(usage.slotKey);
    const label = slot?.name ?? usage.slotKey;
    const fail = (reason: string, extra: { ingredientId?: string; ingredientName?: string } = {}): void => {
      lines.push({ slotKey: usage.slotKey, status: "unresolved", reason, ...extra });
      unresolved.push(`${label}: ${reason}`);
    };

    if (!slot) { fail(`references missing slot "${usage.slotKey}"`); continue; }
    if (slot.resolution.kind === "sub_recipe") {
      const sub = subRecipes.get(slot.resolution.subRecipeVersionId);
      if (!sub) { fail(`sub-recipe ${slot.resolution.subRecipeVersionId} not loaded`, { ingredientName: slot.name }); continue; }
      const fr = subRecipeFraction(usage, sub);
      if ("reason" in fr) { fail(fr.reason, { ingredientName: slot.name }); continue; }
      // Frozen snapshot — scale the child's already-computed total; the child is NOT recomputed here (DM3-1).
      const macros = mapMacros(sub.total, (n) => n * fr.fraction);
      total = zipMacros(total, macros, (x, y) => x + y);
      lines.push({
        slotKey: usage.slotKey, ingredientName: slot.name,
        // line grams are child-mass basis (fraction × child total weight), not as-used grams —
        // exact when the child's yield ≈ its raw mass; lossy/cooked-yield reconciliation is deferred (spec §7).
        grams: round2(fr.fraction * sub.totalGrams), macros: mapMacros(macros, round2), status: "ok",
      });
      if (sub.basis === "partial") unresolved.push(`${label}: sub-recipe macros are partial`);
      continue;
    }
    const ingId = slot.resolution.libraryIngredientId;
    const ing = ingredients.get(ingId);
    if (!ing) {
      fail(`unknown ingredient "${ingId}" — add it to the library`, { ingredientId: ingId, ingredientName: slot.name });
      continue;
    }
    const conv = toGrams(usage.quantityValue, usage.quantityUnit, ing);
    if ("reason" in conv) {
      fail(conv.reason, { ingredientId: ingId, ingredientName: ing.name });
      continue;
    }

    const macros = mapMacros(ing.macrosPer100g, (n) => (n * conv.grams) / 100);
    total = zipMacros(total, macros, (x, y) => x + y);
    lines.push({
      slotKey: usage.slotKey, ingredientId: ingId, ingredientName: ing.name,
      grams: round2(conv.grams), macros: mapMacros(macros, round2), status: "ok",
    });
  }

  const perServing = yieldSpec.amount > 0 ? mapMacros(total, (n) => n / yieldSpec.amount) : { ...ZERO };
  if (yieldSpec.amount <= 0) unresolved.push(`yield amount is ${yieldSpec.amount}; per-serving macros unavailable`);

  return {
    total: mapMacros(total, round2),
    perServing: mapMacros(perServing, round2),
    yield: { ...yieldSpec },
    basis: unresolved.length === 0 ? "complete" : "partial",
    unresolved,
    lines,
    ...(total.protein > 0 ? { caloriesPerGramProtein: round2(total.calories / total.protein) } : {}),
  };
}
