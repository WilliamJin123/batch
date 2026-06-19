import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "../source/db";
import { buildBakeCard } from "./bakeCard";

async function svc() { return serviceFrom(await buildRepository(fixture as any)); }

describe("buildBakeCard", () => {
  it("matches core macros exactly (parity) and carries dual-unit grams", async () => {
    const s = await svc();
    const v = (await s.listVersions()).find((x) => x.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
    const core = await s.exportCard(v.id);
    const card = await buildBakeCard(s, v.recipeId);
    expect(card.perServing.calories).toBe(core.macros.perServing.calories);
    expect(card.whole.calories).toBe(core.macros.total.calories);
    expect(card.calPerGramProtein).toBe(core.macros.caloriesPerGramProtein ?? null);
    const rows = card.ingredientGroups.flatMap((g) => g.items);
    expect(rows.some((r) => r.grams !== undefined && /cup|tbsp|scoop|tsp/.test(r.qtyNatural))).toBe(true);
    expect(card.ingredientGroups.some((g) => g.subRecipe)).toBe(true);
  });
});
