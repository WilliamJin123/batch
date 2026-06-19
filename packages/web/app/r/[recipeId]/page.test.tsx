import { render, screen } from "@testing-library/react";
import fixture from "../../../test/fixtures/db.fixture.json";
import { StaticRecipeSource } from "../../../lib/source/StaticRecipeSource";
import { RecipeHero } from "../../../components/card/RecipeHero";
import { IngredientList } from "../../../components/card/IngredientList";

it("renders the red velvet card hero + dual-unit ingredients", async () => {
  const src = await StaticRecipeSource.fromDb(fixture as any);
  const rv = (await src.listRecipes()).find((r) => r.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
  const card = await src.getBakeCard(rv.recipeId);
  render(<><RecipeHero card={card} /><IngredientList groups={card.ingredientGroups} /></>);
  expect(screen.getByText(/Red Velvet/)).toBeTruthy();
  // dual-unit rendering: at least one ingredient row shows a gram weight alongside a natural measure
  expect(screen.getAllByText(/^\d+(\.\d+)? g$/).length).toBeGreaterThan(0);
});
