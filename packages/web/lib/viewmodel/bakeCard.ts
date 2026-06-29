import type { Note, RecipeService } from "@batch/core";
import type { BakeCardVM, IngredientGroupVM, IngredientRowVM, MacroVM, NoteVM } from "./types";
import { qtyNatural, roundGrams } from "./format";
import { summarizeRecipe, cookUnitLabel } from "@batch/core";

const macroVM = (m: { calories: number; protein: number; carbs: number; fat: number; fiber: number }): MacroVM => ({
  calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber,
});

/**
 * Partition a recipe's notes for the card. The "Watch-outs" panel collects every pitfall (so the
 * "don't ruin it" set always previews up top) plus any recipe-level technique/note; step-anchored
 * notes also map to their step for inline rendering. Mirrors the markdown card's rule (export-card.ts).
 */
export function splitNotes(notes: Note[] | undefined): { panel: NoteVM[]; byStep: Map<string, NoteVM[]> } {
  const panel: NoteVM[] = [];
  const byStep = new Map<string, NoteVM[]>();
  for (const nt of notes ?? []) {
    const vm: NoteVM = { kind: nt.kind, text: nt.text };
    if (nt.kind === "pitfall" || !nt.stepKey) panel.push(vm);
    if (nt.stepKey) {
      const a = byStep.get(nt.stepKey) ?? [];
      a.push(vm);
      byStep.set(nt.stepKey, a);
    }
  }
  return { panel, byStep };
}

export async function buildBakeCard(svc: RecipeService, recipeId: string): Promise<BakeCardVM> {
  const recipe = await svc.getRecipe(recipeId);
  const headId = recipe.headVersionId;
  const { version, content, macros } = await svc.exportCard(headId);
  const { bySection } = await svc.macrosBySection(headId);
  const { panel: notesPanel, byStep: notesByStep } = splitNotes(content.notes);

  // Ingredient groups (dual units): zip flattened usages[i] <-> macros.lines[i],
  // group by the section of the step each usage belongs to.
  const slotByKey = new Map(content.slots.map((s) => [s.componentKey, s] as const));
  const sectionOfStep = new Map(content.steps.map((s) => [s.componentKey, s.section ?? "Base"] as const));
  const ingById = new Map((await svc.listIngredients()).map((ig) => [ig.id, ig] as const));
  const groups = new Map<string, IngredientGroupVM>();
  const stepUses = new Map<string, IngredientRowVM[]>();   // step componentKey -> the ingredients that step adds (cook-mode chips)
  content.usages.forEach((u, i) => {
    const line = macros.lines[i];
    const slot = slotByKey.get(u.slotKey);
    const section = sectionOfStep.get(u.stepKey) ?? "Base";
    // flatten() prefixes a composed sub-recipe's usage keys as "<parentSlot>/..."; that "/"
    // is the robust structural signal that this ingredient came from a sub-recipe (the step's
    // section is the child recipe's NAME, so a name regex can't detect it).
    const isSub = u.slotKey.includes("/");
    // The cook unit is DERIVED from grams (cups/spoons/scoops…), never the unit a quantity was typed
    // in — so the card always reads "<cook unit> · <grams> g" consistently. Grams-only when nothing's
    // derivable; the entered unit only as a last resort when grams itself is unknown (unresolved).
    const ing = line?.ingredientId ? ingById.get(line.ingredientId) : undefined;
    const cook = ing && line?.grams != null ? cookUnitLabel(line.grams, ing) : undefined;
    const grams = roundGrams(line?.grams);
    const qtyNat = cook ?? (grams != null ? `${grams} g` : qtyNatural(u.quantityValue, u.quantityUnit));
    // Inline chips show BOTH measures ("2⅔ tbsp · 4 g") so the method never makes you scroll up to the
    // ingredient list to convert. When there's no derivable cook unit, qtyNat already IS the grams (or the
    // entered unit when grams is unknown), so don't double it up.
    const qtyFull = cook != null && grams != null ? `${cook} · ${grams} g` : qtyNat;
    const row: IngredientRowVM = { qtyNatural: qtyNat, qtyFull, grams, name: slot?.name ?? line?.ingredientName ?? u.slotKey };
    const g = groups.get(section) ?? { title: section, subRecipe: isSub, calories: 0, items: [] };
    g.subRecipe = g.subRecipe || isSub;
    g.calories += line?.status === "ok" ? line.macros.calories : 0;
    g.items.push(row);
    groups.set(section, g);
    // same row attaches to the step that uses it, so the method can show ingredients inline
    const su = stepUses.get(u.stepKey) ?? [];
    su.push(row);
    stepUses.set(u.stepKey, su);
  });
  for (const g of groups.values()) g.calories = Math.round(g.calories);

  const feedback = await svc.feedbackForRecipe(recipeId);
  const summary = summarizeRecipe(feedback);

  return {
    recipeId, versionId: version.id, shortSha: version.id.slice(0, 6),
    name: version.name, description: version.description, tags: version.tags,
    made: summary.tried, rating: summary.verdict, queued: summary.queued,
    yield: version.yield,
    perServing: macroVM(macros.perServing), whole: macroVM(macros.total),
    calPerGramProtein: macros.caloriesPerGramProtein ?? null, basis: macros.basis,
    ingredientGroups: [...groups.values()],
    composition: Object.entries(bySection).map(([name, m]) => ({ name: name.replace(/ · sub-recipe$/i, ""), calories: Math.round(m.calories), protein: Math.round(m.protein * 10) / 10 })),
    lineage: await buildLineage(svc, version),
    method: buildMethod(content, stepUses, notesByStep),
    notes: notesPanel,
    tastingLog: feedback.map((e) =>
      e.kind === "made"
        ? { kind: "made" as const, rating: e.rating, date: e.date.slice(0, 10), note: e.notes, component: e.componentKey }
        : { kind: "to-make" as const, date: e.date.slice(0, 10), note: e.notes, component: e.componentKey }),
  };
}

async function buildLineage(svc: RecipeService, version: import("@batch/core").RecipeVersion) {
  const out: BakeCardVM["lineage"] = [];
  if (version.derivesFromVersionId) {
    const base = await svc.getVersion(version.derivesFromVersionId);
    out.push({ name: base.name, rel: "forked-from", recipeId: base.recipeId });
  }
  for (const slot of version.content.slots) {
    if (slot.resolution.kind === "sub_recipe") {
      const sub = await svc.getVersion(slot.resolution.subRecipeVersionId);
      out.push({ name: sub.name, rel: "composes", recipeId: sub.recipeId });
    }
  }
  return out;
}

function buildMethod(content: import("@batch/core").RecipeContent, stepUses: Map<string, IngredientRowVM[]>, notesByStep: Map<string, NoteVM[]>): BakeCardVM["method"] {
  const bySection = new Map<string, BakeCardVM["method"][number]["steps"]>();
  for (const s of [...content.steps].sort((a, b) => a.order - b.order)) {
    const sec = (s.section ?? "Method").replace(/ · sub-recipe$/i, "");
    const arr = bySection.get(sec) ?? [];
    arr.push({ text: s.instructionText, tempF: s.temperature, minutes: s.timerSeconds ? Math.round(s.timerSeconds / 60) : undefined, ingredients: stepUses.get(s.componentKey) ?? [], notes: notesByStep.get(s.componentKey) });
    bySection.set(sec, arr);
  }
  return [...bySection.entries()].map(([section, steps]) => ({ section, steps }));
}
