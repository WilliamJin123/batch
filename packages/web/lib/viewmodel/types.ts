export interface MacroVM { calories: number; protein: number; carbs: number; fat: number; fiber: number; }
export interface RecipeSummary {
  recipeId: string; versionId: string; name: string; tags: string[];
  kind: "base" | "variant" | "root" | "sub-recipe"; family: string;
  cal: number; protein: number; carbs: number; fat: number; wholeCal: number; wholeProtein: number; calPerGramProtein: number | null; servings: number; servingUnit: string;
  made: boolean; rating?: "bad" | "okay" | "good" | "excellent"; queued: boolean;
}
export interface IngredientRowVM { qtyNatural: string; grams?: number; name: string; }
export interface IngredientGroupVM { title: string; subRecipe: boolean; calories: number; items: IngredientRowVM[]; }
export interface BakeCardVM {
  recipeId: string; versionId: string; shortSha: string;
  name: string; description?: string; tags: string[];
  made: boolean; rating?: "bad" | "okay" | "good" | "excellent"; queued: boolean;
  yield: { amount: number; unit: string };
  perServing: MacroVM; whole: MacroVM; calPerGramProtein: number | null; basis: "complete" | "partial";
  ingredientGroups: IngredientGroupVM[];
  composition: Array<{ name: string; calories: number; protein: number }>;
  lineage: Array<{ name: string; rel: "forked-from" | "composes" | "sibling"; recipeId?: string }>;
  method: Array<{ section: string; steps: Array<{ text: string; tempF?: number; minutes?: number; ingredients: IngredientRowVM[] }> }>;
  tastingLog: Array<{ kind: "made" | "to-make"; rating?: string; date: string; note?: string; component?: string }>;
}
export interface TreeNodeVM extends RecipeSummary { feedbackNote?: string; needsTuning: boolean; }
export interface TreeEdgeVM { from: string; to: string; rel: "derives" | "composes"; }
// A bake-off is N arms (≥2) competing for one slot. `arms` are recipeIds, ordered; the parallel
// `note.arms` carries each arm's display label (A/B/C…) + macro summary, and `differingIngredients`
// lists the ingredients whose per-serving grams aren't identical across all arms (values aligned to
// `note.arms` order). Two arms is the common case (Red Velvet); three+ is an explicit tagged group.
export interface BakeoffArmNote { recipeId: string; name: string; cal: number; calPerGramProtein: number | null; servings: number; label: string; }
export interface BakeoffVM { arms: string[]; note: BakeoffNote; }
export interface BakeoffNote {
  arms: BakeoffArmNote[];
  differingIngredients: Array<{ name: string; values: Array<number | "present" | null> }>;
}
export interface TreeGraphVM { nodes: TreeNodeVM[]; edges: TreeEdgeVM[]; bakeoffs: BakeoffVM[]; }
