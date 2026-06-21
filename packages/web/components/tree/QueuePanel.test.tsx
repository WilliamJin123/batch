import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { QueuePanel } from "./QueuePanel";
import type { TreeGraphVM, TreeNodeVM } from "../../lib/viewmodel/types";

const n = (over: Partial<TreeNodeVM>): TreeNodeVM => ({
  recipeId: "id", versionId: "v", name: "X", tags: [], kind: "root", family: "Singles",
  cal: 200, protein: 20, carbs: 10, fat: 5, wholeCal: 1800, wholeProtein: 180,
  calPerGramProtein: 10, servings: 9, servingUnit: "servings",
  made: false, queued: false, needsTuning: false, ...over,
} as TreeNodeVM);

const graph: TreeGraphVM = {
  nodes: [
    n({ recipeId: "loaf", name: "Carrot Cake Loaf", tags: ["carrot-cake"], queued: true }),
    n({ recipeId: "nbbrownie", name: "No-Bake Brownie Bars", tags: ["brownie", "no-bake", "bars"], queued: true }),
    n({ recipeId: "fudgy", name: "Fudgy Protein Brownies", tags: ["brownie"], made: true, rating: "excellent" }),
    n({ recipeId: "nanaimo", name: "High-Protein Nanaimo Bars", tags: ["bars", "no-bake"], made: true, rating: "excellent" }),
    n({ recipeId: "good", name: "Chewiest Protein Brownies", tags: ["brownie"], made: true, rating: "good" }),
    n({ recipeId: "frosting", name: "Protein Cream-Cheese Frosting", tags: ["frosting", "sub-recipe"], kind: "sub-recipe", queued: true }),
  ],
  edges: [], bakeoffs: [],
};

it("shows the Make-next and Make-again lanes and opens a recipe on click", () => {
  const onPick = vi.fn();
  render(<QueuePanel graph={graph} open={true} onPick={onPick} onClose={() => {}} />);
  expect(screen.getByText(/Make next/i)).toBeTruthy();
  expect(screen.getByText(/Make again/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /No-Bake Brownie Bars/ }));
  expect(onPick).toHaveBeenCalledWith("nbbrownie");
});

it("includes proven excellents in Make again but excludes merely-good and sub-recipes", () => {
  render(<QueuePanel graph={graph} open={true} onPick={() => {}} onClose={() => {}} />);
  expect(screen.getByRole("button", { name: /High-Protein Nanaimo Bars/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Fudgy Protein Brownies/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Chewiest Protein Brownies/ })).toBe(null); // only "good"
  expect(screen.queryByText(/Cream-Cheese Frosting/)).toBe(null);                          // sub-recipe
});
