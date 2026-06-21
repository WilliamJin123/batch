import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { QueueBoard } from "./QueueBoard";
import { buildQueue } from "../../lib/viewmodel/queue";
import type { TreeNodeVM } from "../../lib/viewmodel/types";

const n = (over: Partial<TreeNodeVM>): TreeNodeVM => ({
  recipeId: "id", versionId: "v", name: "X", tags: [], kind: "root", family: "Singles",
  cal: 200, protein: 20, carbs: 10, fat: 5, wholeCal: 1800, wholeProtein: 180,
  calPerGramProtein: 10, servings: 9, servingUnit: "servings",
  made: false, queued: false, needsTuning: false, ...over,
} as TreeNodeVM);

const nodes: TreeNodeVM[] = [
  n({ recipeId: "loaf", name: "Carrot Cake Loaf", tags: ["carrot-cake"], queued: true }),
  n({ recipeId: "nbbrownie", name: "No-Bake Brownie Bars", tags: ["brownie", "no-bake", "bars"], queued: true }),
  n({ recipeId: "fudgy", name: "Fudgy Protein Brownies", tags: ["brownie"], made: true, rating: "excellent" }),
  n({ recipeId: "nanaimo", name: "High-Protein Nanaimo Bars", tags: ["bars", "no-bake"], made: true, rating: "excellent" }),
  n({ recipeId: "good", name: "Chewiest Protein Brownies", tags: ["brownie"], made: true, rating: "good" }),
  n({ recipeId: "frosting", name: "Protein Cream-Cheese Frosting", tags: ["frosting", "sub-recipe"], kind: "sub-recipe", queued: true }),
];

it("lays out Make-next and Make-again lanes, no-bakes in their own column, rows as recipe links", () => {
  const { container } = render(<QueueBoard queue={buildQueue(nodes)} />);
  expect(screen.getByRole("heading", { name: /Make next/i })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Make again/i })).toBeTruthy();

  // a queued no-bake is a link to its recipe page AND sits inside a no-bake column
  const nb = screen.getByRole("link", { name: /No-Bake Brownie Bars/ });
  expect(nb.getAttribute("href")).toBe("/r/nbbrownie");
  expect(container.querySelector(".qb-col.nb")?.contains(nb)).toBe(true);

  // proven excellents present (both bake + no-bake); merely-good and sub-recipes excluded
  expect(screen.getByRole("link", { name: /High-Protein Nanaimo Bars/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Fudgy Protein Brownies/ })).toBeTruthy();
  expect(screen.queryByText(/Chewiest Protein Brownies/)).toBe(null);
  expect(screen.queryByText(/Cream-Cheese Frosting/)).toBe(null);
});
