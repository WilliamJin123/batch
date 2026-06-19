import { render, screen } from "@testing-library/react";
import { MacroLine } from "./MacroLine";
import { RatingChip } from "./RatingChip";

it("MacroLine shows cal, protein, ratio, servings", () => {
  render(<MacroLine cal={205} protein={17.8} calPerGramProtein={11.5} servings={6} unit="cookies" />);
  expect(screen.getByText(/205 cal/)).toBeTruthy();
  expect(screen.getByText(/17.8 P/)).toBeTruthy();
  expect(screen.getByText(/makes 6/)).toBeTruthy();
});
it("RatingChip renders excellent as a star", () => {
  render(<RatingChip rating="excellent" made />);
  expect(screen.getByText(/excellent/i)).toBeTruthy();
});
