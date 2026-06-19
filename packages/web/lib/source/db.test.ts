import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "./db";

describe("db loader", () => {
  it("seeds a service whose recipe count matches the fixture", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const recipes = await svc.listRecipes();
    expect(recipes.length).toBe(Object.keys((fixture as any).recipes).length);
  });
  it("resolves a recipe name to a bake card via exportCard", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const rv = (await svc.listVersions()).find((v) => v.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
    const card = await svc.exportCard(rv.id);
    expect(card.macros.perServing.calories).toBeGreaterThan(0);
  });
});
