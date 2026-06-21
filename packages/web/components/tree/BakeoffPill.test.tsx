import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BakeoffPill } from "./BakeoffPill";

const note = {
  arms: [
    { recipeId: "loaf", name: "Carrot Cake Loaf", cal: 1040, calPerGramProtein: 11.3, servings: 16, label: "A" },
    { recipeId: "cake", name: "Protein Carrot Cake", cal: 250, calPerGramProtein: 7.6, servings: 6, label: "B" },
    { recipeId: "bars", name: "Carrot Cake Protein Bars", cal: 190, calPerGramProtein: 11.9, servings: 9, label: "C" },
  ],
  differingIngredients: [{ name: "all-purpose flour", values: [100, 0, 40] as any }, { name: "banana", values: [0, 120, 0] as any }],
};

it("renders one row per arm (A/B/C) with each arm's name", () => {
  render(<BakeoffPill note={note as any} pos={{ x: 0, y: 0 }} />);
  expect(screen.getByText("A")).toBeTruthy();
  expect(screen.getByText("B")).toBeTruthy();
  expect(screen.getByText("C")).toBeTruthy();
  expect(screen.getByText(/Carrot Cake Loaf/)).toBeTruthy();
  expect(screen.getByText(/Protein Carrot Cake/)).toBeTruthy();
  expect(screen.getByText(/Carrot Cake Protein Bars/)).toBeTruthy();
});

it("headlines the arm count and lists the differing ingredients", () => {
  render(<BakeoffPill note={note as any} pos={{ x: 0, y: 0 }} />);
  expect(screen.getByText(/3 arms/)).toBeTruthy();
  expect(screen.getByText(/all-purpose flour, banana/)).toBeTruthy();
});
