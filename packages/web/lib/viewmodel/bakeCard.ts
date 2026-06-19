import type { RecipeService } from "@batch/core";
import type { BakeCardVM, IngredientGroupVM, MacroVM } from "./types";
import { qtyNatural, roundGrams } from "./format";
import { summarizeRecipe } from "@batch/core";

const macroVM = (m: { calories: number; protein: number; carbs: number; fat: number; fiber: number }): MacroVM => ({
  calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber,
});

export async function buildBakeCard(svc: RecipeService, recipeId: string): Promise<BakeCardVM> {
  const recipe = await svc.getRecipe(recipeId);
  const headId = recipe.headVersionId;
  const { version, content, macros } = await svc.exportCard(headId);
  const { bySection } = await svc.macrosBySection(headId);

  // Ingredient groups (dual units): zip flattened usages[i] <-> macros.lines[i],
  // group by the section of the step each usage belongs to.
  const slotByKey = new Map(content.slots.map((s) => [s.componentKey, s] as const));
  const sectionOfStep = new Map(content.steps.map((s) => [s.componentKey, s.section ?? "Base"] as const));
  const groups = new Map<string, IngredientGroupVM>();
  content.usages.forEach((u, i) => {
    const line = macros.lines[i];
    const slot = slotByKey.get(u.slotKey);
    const section = sectionOfStep.get(u.stepKey) ?? "Base";
    const g = groups.get(section) ?? { title: section.replace(/ · sub-recipe$/i, ""), subRecipe: /sub-recipe/i.test(section), calories: 0, items: [] };
    g.calories += line?.macros?.calories ?? 0;
    g.items.push({ qtyNatural: qtyNatural(u.quantityValue, u.quantityUnit), grams: roundGrams(line?.grams), name: slot?.name ?? line?.ingredientName ?? u.slotKey });
    groups.set(section, g);
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
    method: buildMethod(content),
    tastingLog: feedback.map((e) => ({ kind: e.kind, rating: e.kind === "made" ? e.rating : undefined, date: e.date.slice(0, 10), note: e.notes, component: e.componentKey })),
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

function buildMethod(content: import("@batch/core").RecipeContent): BakeCardVM["method"] {
  const bySection = new Map<string, BakeCardVM["method"][number]["steps"]>();
  for (const s of [...content.steps].sort((a, b) => a.order - b.order)) {
    const sec = (s.section ?? "Method").replace(/ · sub-recipe$/i, "");
    const arr = bySection.get(sec) ?? [];
    arr.push({ text: s.instructionText, tempF: s.temperature, minutes: s.timerSeconds ? Math.round(s.timerSeconds / 60) : undefined });
    bySection.set(sec, arr);
  }
  return [...bySection.entries()].map(([section, steps]) => ({ section, steps }));
}
