import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect } from "vitest";
import { TreeOutline } from "./TreeOutline";
import type { TreeGraphVM, TreeNodeVM } from "../../lib/viewmodel/types";

const loaf: TreeNodeVM = {
  recipeId: "r1", versionId: "v1", name: "Carrot Cake Loaf", tags: ["carrot-cake"], kind: "root", family: "Carrot Cake",
  cal: 65, protein: 6, carbs: 8, fat: 1, wholeCal: 1040, wholeProtein: 93, calPerGramProtein: 11.2,
  servings: 16, servingUnit: "slices", made: false, queued: true, needsTuning: false,
};
const graph: TreeGraphVM = { nodes: [loaf], edges: [], bakeoffs: [] };

it("reveals a macro preview card when hovering a recipe row, and hides it on leave", () => {
  render(<TreeOutline graph={graph} focus={null} open={true} onPick={() => {}} onClose={() => {}} />);
  const row = screen.getByRole("button", { name: /Carrot Cake Loaf/ });
  expect(screen.queryByTestId("tol-pop")).toBe(null);

  fireEvent.mouseEnter(row);
  const pop = screen.getByTestId("tol-pop");
  expect(pop.textContent).toContain("65 cal");
  expect(pop.textContent).toContain("8g C"); // carbs surfaced
  expect(pop.textContent).toContain("1g F"); // fat surfaced

  fireEvent.mouseLeave(row);
  expect(screen.queryByTestId("tol-pop")).toBe(null);
});
