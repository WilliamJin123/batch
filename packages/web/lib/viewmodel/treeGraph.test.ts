import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "../source/db";
import { buildTreeGraph, familyOf } from "./treeGraph";

describe("familyOf", () => {
  const fam = (tags: string[]) => familyOf({ tags } as any);
  it("groups the new dessert families by their lead family tag", () => {
    expect(fam(["carrot-cake", "cake", "protein"])).toBe("Carrot Cake");
    expect(fam(["carrot-cake", "bars", "protein"])).toBe("Carrot Cake"); // carrot bars join carrot, not Protein Bars
    expect(fam(["tiramisu", "protein", "no-bake"])).toBe("Tiramisu");
    expect(fam(["apple-fritter", "protein", "baked"])).toBe("Apple Fritter");
  });
  it("still maps existing families and falls back to the catch-all", () => {
    expect(fam(["bars", "protein"])).toBe("Protein Bars");
    expect(fam(["cheesecake"])).toBe("Cheesecake");
    expect(fam(["protein", "no-bake"])).toBe("Singles & No-bake");
  });
});

describe("buildTreeGraph", () => {
  it("emits a derive edge from the Crumbl-base red velvet to the Crumbl base", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    const rvA = g.nodes.find((n) => n.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
    const base = g.nodes.find((n) => n.name === "Crumbl Base Protein Cookie")!;
    expect(g.edges.some((e) => e.from === rvA.recipeId && e.to === base.recipeId && e.rel === "derives")).toBe(true);
  });
  it("emits compose edges from both red velvets to the cream-cheese frosting", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    const frosting = g.nodes.find((n) => n.name === "Protein Cream-Cheese Frosting")!;
    const composers = g.edges.filter((e) => e.to === frosting.recipeId && e.rel === "composes");
    expect(composers.length).toBeGreaterThanOrEqual(2);
  });
  it("detects the red velvet bake-off pair", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    expect(g.bakeoffs.some((b) => b.note.a.name.includes("Red Velvet") && b.note.b.name.includes("Red Velvet"))).toBe(true);
  });
  it("carries per-serving carbs and fat on each node (for the hover preview)", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    const cookie = g.nodes.find((n) => n.name === "Crumbl Base Protein Cookie")!;
    expect(typeof cookie.carbs).toBe("number");
    expect(typeof cookie.fat).toBe("number");
    expect(cookie.carbs).toBeGreaterThan(0);
    expect(cookie.fat).toBeGreaterThan(0);
  });
});
