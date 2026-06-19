import { type RecipeService } from "@batch/core";
import { buildRepository, serviceFrom, type RawDb } from "./db";
import type { RecipeSource } from "./RecipeSource";
import type { BakeCardVM, RecipeSummary, TreeGraphVM } from "../viewmodel/types";
import { buildSummaries, buildTreeGraph } from "../viewmodel/treeGraph";
import { buildBakeCard } from "../viewmodel/bakeCard";

export class StaticRecipeSource implements RecipeSource {
  private constructor(private svc: RecipeService) {}
  static async fromDb(db: RawDb): Promise<StaticRecipeSource> {
    return new StaticRecipeSource(serviceFrom(await buildRepository(db)));
  }
  listRecipes(): Promise<RecipeSummary[]> { return buildSummaries(this.svc); }
  getBakeCard(recipeId: string): Promise<BakeCardVM> { return buildBakeCard(this.svc, recipeId); }
  getTreeGraph(): Promise<TreeGraphVM> { return buildTreeGraph(this.svc); }
}
