import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Method } from "./Method";

const sections: any = [
  {
    section: "Bake",
    steps: [
      { text: "Bake the filling", tempF: 350, ingredients: [], notes: [{ kind: "pitfall", text: "don't overbake — pull while it jiggles" }] },
      { text: "Cool fully", ingredients: [], notes: [] },
    ],
  },
];

it("Method renders an inline note under the step that carries one", () => {
  render(<Method sections={sections} />);
  expect(screen.getByText(/don't overbake/)).toBeTruthy();
});

it("Method leaves a step with no notes clean", () => {
  render(<Method sections={[{ section: "Bake", steps: [{ text: "Cool fully", ingredients: [], notes: [] }] }] as any} />);
  expect(screen.queryByText(/overbake/)).toBe(null);
});
