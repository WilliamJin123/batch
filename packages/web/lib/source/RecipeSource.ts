import type { BakeCardVM, RecipeSummary, TreeGraphVM } from "../viewmodel/types";

export interface RecipeSource {
  listRecipes(): Promise<RecipeSummary[]>;
  getBakeCard(recipeId: string): Promise<BakeCardVM>;
  getTreeGraph(): Promise<TreeGraphVM>;

  // --- writes: declared for the "no rewrite later" guarantee; NOT implemented in v1 ---
  // Implementing these later = calling the same @batch/core mutations the CLI uses
  // (derive/applyOverride/editMetadata/addFeedback/promote/rebase) behind an API route.
  applyOverride?(recipeId: string, entry: unknown): Promise<never>;
  addFeedback?(recipeId: string, input: unknown): Promise<never>;
}
