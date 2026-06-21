import { vi, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecipeNode } from "./RecipeNode";

const node: any = {
  recipeId: "r1", versionId: "v1", name: "Red Velvet (Crumbl Base)", tags: [], kind: "variant",
  family: "Crumbl Cookies", cal: 205, protein: 17.8, calPerGramProtein: 11.5, servings: 6,
  servingUnit: "cookies", made: false, queued: true, needsTuning: false,
};

it("RecipeNode renders name, macro line, and a rating", () => {
  render(<RecipeNode node={node} pos={{ x: 0, y: 0, w: 200, h: 96 }} />);
  expect(screen.getByText(/Red Velvet/)).toBeTruthy();
  expect(screen.getByText(/205 cal/)).toBeTruthy();
  expect(screen.getByText(/to make/)).toBeTruthy();
});

it("RecipeNode marks a no-bake recipe, and leaves a baked one unmarked", () => {
  const { rerender } = render(<RecipeNode node={{ ...node, tags: ["no-bake"] }} pos={{ x: 0, y: 0, w: 200, h: 96 }} />);
  expect(screen.getByText(/no-bake/i)).toBeTruthy();
  rerender(<RecipeNode node={{ ...node, tags: ["bars"] }} pos={{ x: 0, y: 0, w: 200, h: 96 }} />);
  expect(screen.queryByText(/no-bake/i)).toBe(null);
});

it("RecipeNode opens the card (fires onOpen with the recipeId) when clicked", () => {
  const onOpen = vi.fn();
  render(<RecipeNode node={node} pos={{ x: 0, y: 0, w: 200, h: 96 }} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole("button", { name: /Open Red Velvet/ }));
  expect(onOpen).toHaveBeenCalledWith("r1");
});
