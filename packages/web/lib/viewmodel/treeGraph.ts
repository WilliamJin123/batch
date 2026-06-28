import type { RecipeService, RecipeVersion, RecipeFeedbackSummary } from "@batch/core";
import type { RecipeSummary, TreeEdgeVM, TreeGraphVM, TreeNodeVM, BakeoffVM } from "./types";

// Family assignment has three tiers of precedence:
//   1. a SPECIFIC dessert family (a no-bake cheesecake is still a Cheesecake) — among these, the
//      recipe's own tag order breaks ties, preserving the original behaviour;
//   2. else `no-bake` — its own first-class category, so it outranks the generic bars/cake tags
//      (a plain no-bake bar groups under No-Bake, not Protein Bars);
//   3. else the GENERIC bars/cake; else a true standalone is a "Single".
// (This split retires the old "Singles & No-bake" catch-all, which conflated the two.)
const SPECIFIC_FAMILIES: Record<string, string> = {
  crumbl: "Crumbl Cookies", cheesecake: "Cheesecake", "browned-butter": "Browned-Butter",
  brownie: "Brownies", "carrot-cake": "Carrot Cake", "apple-fritter": "Apple Fritter",
  tiramisu: "Tiramisu", frosting: "Frostings", crust: "Crusts",
};
export function familyOf(v: RecipeVersion): string {
  const specific = v.tags.find((x) => x in SPECIFIC_FAMILIES);   // recipe-tag order wins among specifics
  if (specific) return SPECIFIC_FAMILIES[specific];
  if (v.tags.includes("no-bake")) return "No-Bake";
  if (v.tags.includes("bars")) return "Protein Bars";
  if (v.tags.includes("cake")) return "Cakes";
  return "Singles";
}
function nameStem(name: string): string { return name.replace(/\s*\([^)]*\)\s*$/, "").trim(); }

const ARM_LABELS = "ABCDEFGHIJKL";
/** Assemble one bake-off (2..N arms) from a group of head nodes: label them A/B/C…, pull a
 *  per-serving macro summary onto each, and diff their ingredient grams via `compare` (a row is
 *  kept only when the arms don't all agree). Works for any arm count — `compare` aligns ≥2 versions. */
async function makeBakeoff(svc: RecipeService, group: TreeNodeVM[]): Promise<BakeoffVM> {
  const cmp = await svc.compare(group.map((n) => n.versionId));
  const differingIngredients = cmp.ingredients
    .filter((r) => new Set(group.map((n) => JSON.stringify(r.perServingGrams[n.versionId] ?? null))).size > 1)
    .map((r) => ({ name: r.name, values: group.map((n) => r.perServingGrams[n.versionId] ?? null) }))
    .slice(0, 8);
  return {
    arms: group.map((n) => n.recipeId),
    note: {
      arms: group.map((n, i) => ({
        recipeId: n.recipeId, name: n.name, cal: n.cal,
        calPerGramProtein: n.calPerGramProtein, servings: n.servings, label: ARM_LABELS[i] ?? "·",
      })),
      differingIngredients,
    },
  };
}

async function summarize(svc: RecipeService): Promise<{ heads: RecipeVersion[]; nodes: TreeNodeVM[] }> {
  const recipes = await svc.listRecipes();
  const fb = await svc.feedbackSummary();
  const heads = await Promise.all(recipes.map((r) => svc.getVersion(r.headVersionId)));
  // a recipe is a "base" if some other head derives from it
  const isBase = new Set<string>();
  for (const v of heads) if (v.derivesFromVersionId) {
    const baseV = heads.find((h) => h.id === v.derivesFromVersionId) ?? await svc.getVersion(v.derivesFromVersionId);
    isBase.add(baseV.recipeId);
  }
  const nodes: TreeNodeVM[] = await Promise.all(heads.map(async (v) => {
    const m = v.macros!;
    const sum: RecipeFeedbackSummary = fb[v.recipeId] ?? { tried: false, queued: false };
    const isSub = v.tags.includes("sub-recipe");
    const kind: RecipeSummary["kind"] = isSub ? "sub-recipe" : v.derivesFromVersionId ? "variant" : isBase.has(v.recipeId) || v.tags.includes("base") ? "base" : "root";
    const fbEntries = await svc.feedbackForRecipe(v.recipeId);
    const latestMade = fbEntries.find((e) => e.kind === "made");
    return {
      recipeId: v.recipeId, versionId: v.id, name: v.name, tags: v.tags, kind, family: familyOf(v),
      cal: Math.round(m.perServing.calories), protein: Math.round(m.perServing.protein * 10) / 10,
      carbs: Math.round(m.perServing.carbs * 10) / 10, fat: Math.round(m.perServing.fat * 10) / 10,
      wholeCal: Math.round(m.total.calories), wholeProtein: Math.round(m.total.protein),
      calPerGramProtein: m.caloriesPerGramProtein ?? null,
      servings: v.yield.amount, servingUnit: v.yield.unit,
      made: sum.tried, rating: sum.verdict, queued: sum.queued, status: v.status,
      feedbackNote: latestMade?.notes, needsTuning: v.tags.includes("needs-tuning"),
    };
  }));
  return { heads, nodes };
}

export async function buildSummaries(svc: RecipeService): Promise<RecipeSummary[]> {
  return (await summarize(svc)).nodes;
}

export async function buildTreeGraph(svc: RecipeService): Promise<TreeGraphVM> {
  const { heads, nodes } = await summarize(svc);
  const recipeOfVersion = new Map<string, string>();
  for (const v of await svc.listVersions()) recipeOfVersion.set(v.id, v.recipeId);

  const edges: TreeEdgeVM[] = [];
  for (const v of heads) {
    if (v.derivesFromVersionId) {
      const to = recipeOfVersion.get(v.derivesFromVersionId);
      if (to) edges.push({ from: v.recipeId, to, rel: "derives" });
    }
    for (const slot of v.content.slots) {
      if (slot.resolution.kind === "sub_recipe") {
        const to = recipeOfVersion.get(slot.resolution.subRecipeVersionId);
        if (to && to !== v.recipeId) edges.push({ from: v.recipeId, to, rel: "composes" });
      }
    }
  }

  const bakeoffs: BakeoffVM[] = [];
  const claimed = new Set<string>();

  // 1. EXPLICIT N-way: every head sharing a `bakeoff:<slug>` tag is one arm of that bake-off — any
  // arm count, regardless of name or family (e.g. the carrot 3-way: a loaf, a cake, and bars, three
  // independent roots competing for one base). The user declared the group, so we trust it verbatim.
  const tagGroups = new Map<string, TreeNodeVM[]>();
  for (const n of nodes) {
    const tag = n.tags.find((t) => t.startsWith("bakeoff:"));
    if (tag) (tagGroups.get(tag) ?? tagGroups.set(tag, []).get(tag)!).push(n);
  }
  for (const group of tagGroups.values()) {
    if (group.length >= 2) { group.forEach((n) => claimed.add(n.recipeId)); bakeoffs.push(await makeBakeoff(svc, group)); }
  }

  // 2. IMPLICIT 2-way (back-compat): a stem family that is EXACTLY two untried siblings awaiting a
  // head-to-head verdict, not already part of an explicit group. Strictest, lowest-false-positive
  // rule — flags Red Velvet (Oat vs Crumbl), refuses to guess on larger families (e.g. an ablation sweep).
  const byStem = new Map<string, TreeNodeVM[]>();
  for (const n of nodes) {
    if (claimed.has(n.recipeId)) continue;
    const k = nameStem(n.name); (byStem.get(k) ?? byStem.set(k, []).get(k)!).push(n);
  }
  for (const group of byStem.values()) {
    if (group.length === 2 && group.every((n) => !n.made)) bakeoffs.push(await makeBakeoff(svc, group));
  }

  return { nodes, edges, bakeoffs };
}
