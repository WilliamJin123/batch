import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { MixinsGuide } from "./MixinsGuide";

it("renders the mix-ins guide: title, categories, and item notes", () => {
  render(<MixinsGuide />);
  expect(screen.getByRole("heading", { level: 1, name: /Mix-ins/i })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Chocolate/i })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Fruit/i })).toBeTruthy();
  // a couple of distinctive item notes are present
  expect(screen.getByText(/lean MVP/i)).toBeTruthy();
  expect(screen.getByText(/closest stand-in for cereal/i)).toBeTruthy();
});
