import { describe, it, expect } from "vitest";
import { InMemoryRepository, RecipeService, realDeps } from "@batch/core";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "../source/db";
import { buildTreeGraph, familyOf } from "./treeGraph";

/** A throwaway in-memory service with three recipes sharing a `bakeoff:*` tag —
 *  the explicit N-way bake-off scenario (independent roots, different names). */
async function trioSvc(): Promise<RecipeService> {
  const svc = new RecipeService(new InMemoryRepository(), realDeps());
  await svc.addIngredient({ id: "ing-flour", name: "Flour", macrosPer100g: { calories: 364, protein: 10, carbs: 76, fat: 1, fiber: 3 } } as any);
  const mk = (name: string, grams: number) => svc.createRecipe({
    name, yield: { amount: 4, unit: "slices" }, tags: ["carrot-cake", "bakeoff:carrot-base"],
    content: {
      steps: [{ componentKey: "s1", order: 1, instructionText: "mix and bake" }],
      slots: [{ componentKey: "sl1", name: "flour", resolution: { kind: "raw", libraryIngredientId: "ing-flour" } }],
      usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sl1", quantityValue: grams, quantityUnit: "g" }],
    } as any,
  });
  await mk("Carrot Cake Loaf", 200);
  await mk("Protein Carrot Cake", 100);
  await mk("Carrot Cake Protein Bars", 150);
  return svc;
}

describe("familyOf", () => {
  const fam = (tags: string[]) => familyOf({ tags } as any);
  it("groups the new dessert families by their lead family tag", () => {
    expect(fam(["carrot-cake", "cake", "protein"])).toBe("Carrot Cake");
    expect(fam(["carrot-cake", "bars", "protein"])).toBe("Carrot Cake"); // carrot bars join carrot, not Protein Bars
    expect(fam(["tiramisu", "protein", "no-bake"])).toBe("Tiramisu");
    expect(fam(["apple-fritter", "protein", "baked"])).toBe("Apple Fritter");
  });
  it("maps existing families, gives no-bake its own category, and falls back to Singles", () => {
    expect(fam(["bars", "protein"])).toBe("Protein Bars");
    expect(fam(["cheesecake"])).toBe("Cheesecake");
    // no-bake is now its own family — the old "Singles & No-bake" catch-all is split apart
    expect(fam(["protein", "no-bake"])).toBe("No-Bake");
    // no-bake outranks the GENERIC bars/cake tags even when they're listed first on the recipe…
    expect(fam(["bars", "no-bake", "protein"])).toBe("No-Bake");
    expect(fam(["cake", "no-bake"])).toBe("No-Bake");
    // …but a SPECIFIC dessert family still wins (a no-bake cheesecake is still a Cheesecake)
    expect(fam(["cheesecake", "no-bake", "bars"])).toBe("Cheesecake");
    expect(fam(["brownie", "no-bake", "bars"])).toBe("Brownies");
    // a true standalone with no family tag is a Single — no longer lumped in with the no-bakes
    expect(fam(["cookie", "protein"])).toBe("Singles");
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
  it("detects the red velvet bake-off pair as a 2-arm bake-off", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    const rv = g.bakeoffs.find((b) => b.note.arms?.every((a) => a.name.includes("Red Velvet")));
    expect(rv).toBeTruthy();
    expect(rv!.arms.length).toBe(2);
    expect(rv!.note.arms.map((a) => a.label)).toEqual(["A", "B"]);
  });

  it("groups recipes sharing a bakeoff:* tag into ONE N-way bake-off (any arm count)", async () => {
    const g = await buildTreeGraph(await trioSvc());
    const bo = g.bakeoffs.find((b) => b.arms.length === 3);
    expect(bo).toBeTruthy();
    expect(bo!.note.arms.length).toBe(3);
    expect(bo!.note.arms.map((a) => a.name).sort()).toEqual(["Carrot Cake Loaf", "Carrot Cake Protein Bars", "Protein Carrot Cake"]);
    expect(bo!.note.arms.map((a) => a.label).sort()).toEqual(["A", "B", "C"]);
    // the three differ in flour grams/serving → at least one differing-ingredient row, values aligned to arms
    expect(bo!.note.differingIngredients.length).toBeGreaterThan(0);
    expect(bo!.note.differingIngredients[0].values.length).toBe(3);
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
