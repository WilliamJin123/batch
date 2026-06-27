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

it("Method inline chips show BOTH the cook unit and grams so you never scroll up to convert", () => {
  render(<Method sections={[{ section: "Mix", steps: [
    { text: "Whisk in the sweetener", ingredients: [
      { qtyNatural: "2⅔ tbsp", qtyFull: "2⅔ tbsp · 4 g", grams: 4, name: "granulated Splenda" },
    ], notes: [] },
  ] }] as any} />);
  expect(screen.getByText(/2⅔ tbsp · 4 g/)).toBeTruthy(); // both measures, inline
  expect(screen.getByText(/granulated Splenda/)).toBeTruthy();
});
