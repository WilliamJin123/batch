import type { RecipeService, RecipeVersion, RecipeFeedbackSummary } from "@batch/core";
import type { RecipeSummary, TreeEdgeVM, TreeGraphVM, TreeNodeVM, BakeoffVM } from "./types";

const FAMILY_TAGS = ["cheesecake", "crumbl", "browned-butter", "brownie", "frosting", "crust", "bars", "cake"];
function familyOf(v: RecipeVersion): string {
  const t = v.tags.find((x) => FAMILY_TAGS.includes(x));
  if (t === "crumbl") return "Crumbl Cookies";
  if (t === "cheesecake") return "Cheesecake";
  if (t === "browned-butter") return "Browned-Butter";
  if (t === "brownie") return "Brownies";
  if (t === "frosting") return "Frostings";
  if (t === "crust") return "Crusts";
  if (t === "bars") return "Protein Bars";
  if (t === "cake") return "Cakes";
  return "Singles & No-bake";
}
function nameStem(name: string): string { return name.replace(/\s*\([^)]*\)\s*$/, "").trim(); }

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

  // bake-off: a stem family that is EXACTLY two untried siblings awaiting a head-to-head
  // verdict. Strictest, lowest-false-positive rule — flags Red Velvet (Oat vs Crumbl) and
  // refuses to guess on larger families (e.g. Browned-Butter's 50g/60g *ablation sweep*).
  const byStem = new Map<string, TreeNodeVM[]>();
  for (const n of nodes) { const k = nameStem(n.name); (byStem.get(k) ?? byStem.set(k, []).get(k)!).push(n); }
  const bakeoffs: BakeoffVM[] = [];
  for (const group of byStem.values()) {
    if (group.length === 2 && group.every((n) => !n.made)) {
      const [a, b] = group;
      const cmp = await svc.compare([a.versionId, b.versionId]);
      const differing = cmp.ingredients.filter((r) => r.perServingGrams[a.versionId] !== r.perServingGrams[b.versionId])
        .map((r) => ({ name: r.name, a: r.perServingGrams[a.versionId] ?? null, b: r.perServingGrams[b.versionId] ?? null }));
      bakeoffs.push({ a: a.recipeId, b: b.recipeId, note: {
        a: { name: a.name, cal: a.cal, calPerGramProtein: a.calPerGramProtein, servings: a.servings },
        b: { name: b.name, cal: b.cal, calPerGramProtein: b.calPerGramProtein, servings: b.servings },
        differingIngredients: differing.slice(0, 8),
      }});
    }
  }
  return { nodes, edges, bakeoffs };
}
