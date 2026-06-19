import { loadDb } from "../../../lib/source/db";
import { StaticRecipeSource } from "../../../lib/source/StaticRecipeSource";
import { RecipeHero } from "../../../components/card/RecipeHero";
import { IngredientList } from "../../../components/card/IngredientList";
import { CompositionRollup } from "../../../components/card/CompositionRollup";
import { Lineage } from "../../../components/card/Lineage";
import { TastingLog } from "../../../components/card/TastingLog";
import { Method } from "../../../components/card/Method";

export async function generateStaticParams() {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  return (await src.listRecipes()).map((r) => ({ recipeId: r.recipeId }));
}

export default async function Page({ params }: { params: { recipeId: string } }) {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  const card = await src.getBakeCard(params.recipeId);
  return (
    <main>
      <RecipeHero card={card} />
      <div className="grid">
        <div className="rail">
          <IngredientList groups={card.ingredientGroups} />
          <CompositionRollup rows={card.composition} whole={card.whole} perServing={card.perServing} servings={card.yield.amount} />
          <Lineage items={card.lineage} />
          <TastingLog entries={card.tastingLog} />
        </div>
        <Method sections={card.method} />
      </div>
    </main>
  );
}
