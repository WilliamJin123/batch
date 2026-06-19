import { vi, it, expect } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }));
import { render, screen } from "@testing-library/react";
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
