import { render, screen } from "@testing-library/react";
import { vi, it, expect } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }));
import fixture from "../test/fixtures/db.fixture.json";
import { StaticRecipeSource } from "../lib/source/StaticRecipeSource";
import { IndexTable } from "./IndexTable";

it("renders a catalog linking to recipe cards", async () => {
  const src = await StaticRecipeSource.fromDb(fixture as any);
  const rows = await src.listRecipes();
  render(<IndexTable rows={rows} />);
  const links = screen.getAllByRole("link");
  expect(links.length).toBeGreaterThan(0);
  expect(links.some((l) => l.getAttribute("href")?.startsWith("/r/"))).toBe(true);
});
