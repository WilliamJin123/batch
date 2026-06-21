import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";

vi.mock("../card/RecipeHero", () => ({ RecipeHero: () => <div /> }));
vi.mock("../card/IngredientList", () => ({ IngredientList: () => <div /> }));
vi.mock("../card/CompositionRollup", () => ({ CompositionRollup: () => <div /> }));
vi.mock("../card/Lineage", () => ({ Lineage: () => <div /> }));
vi.mock("../card/TastingLog", () => ({ TastingLog: () => <div /> }));
vi.mock("../card/Method", () => ({ Method: () => <div /> }));

import { CardModal } from "./CardModal";

const card: any = {
  recipeId: "r1", name: "X", tags: [], made: false, queued: false, shortSha: "abcdef0",
  yield: { amount: 1, unit: "x" }, perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  whole: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, calPerGramProtein: null, basis: "complete",
  ingredientGroups: [], composition: [], lineage: [], method: [], tastingLog: [],
};

it("offers a back-to-results control only when onBack is provided, and calls it", () => {
  const onBack = vi.fn();
  const { rerender } = render(<CardModal card={card} onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: /results/i })).toBe(null);

  rerender(<CardModal card={card} onClose={() => {}} onBack={onBack} />);
  fireEvent.click(screen.getByRole("button", { name: /results/i }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
