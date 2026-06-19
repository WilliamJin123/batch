export interface MacroVM { calories: number; protein: number; carbs: number; fat: number; fiber: number; }
export interface RecipeSummary {
  recipeId: string; versionId: string; name: string; tags: string[];
  kind: "base" | "variant" | "root" | "sub-recipe"; family: string;
  cal: number; protein: number; wholeCal: number; wholeProtein: number; calPerGramProtein: number | null; servings: number; servingUnit: string;
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
export interface BakeoffVM { a: string; b: string; note: BakeoffNote; }
export interface BakeoffNote {
  a: { name: string; cal: number; calPerGramProtein: number | null; servings: number };
  b: { name: string; cal: number; calPerGramProtein: number | null; servings: number };
  differingIngredients: Array<{ name: string; a: number | "present" | null; b: number | "present" | null }>;
}
export interface TreeGraphVM { nodes: TreeNodeVM[]; edges: TreeEdgeVM[]; bakeoffs: BakeoffVM[]; }
