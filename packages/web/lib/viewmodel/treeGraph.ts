import type { RecipeService, RecipeVersion, RecipeFeedbackSummary } from "@batch/core";
import type { RecipeSummary, TreeEdgeVM, TreeGraphVM, TreeNodeVM, BakeoffVM } from "./types";

// A recipe joins the family of the FIRST of its tags that appears here, so a recipe that is both
// (say) "carrot-cake" and "bars" should list the specific family tag first to land in it.
const FAMILY_TAGS = ["cheesecake", "crumbl", "browned-butter", "brownie", "carrot-cake", "apple-fritter", "tiramisu", "frosting", "crust", "bars", "cake"];
export function familyOf(v: RecipeVersion): string {
  const t = v.tags.find((x) => FAMILY_TAGS.includes(x));
  if (t === "crumbl") return "Crumbl Cookies";
  if (t === "cheesecake") return "Cheesecake";
  if (t === "browned-butter") return "Browned-Butter";
  if (t === "brownie") return "Brownies";
  if (t === "carrot-cake") return "Carrot Cake";
  if (t === "apple-fritter") return "Apple Fritter";
  if (t === "tiramisu") return "Tiramisu";
  if (t === "frosting") return "Frostings";
  if (t === "crust") return "Crusts";
  if (t === "bars") return "Protein Bars";
  if (t === "cake") return "Cakes";
  return "Singles & No-bake";
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
      made: sum.tried, rating: sum.verdict, queued: sum.queued,
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
