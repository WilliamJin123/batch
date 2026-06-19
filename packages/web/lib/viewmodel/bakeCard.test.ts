import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "../source/db";
import { buildBakeCard } from "./bakeCard";

async function svc() { return serviceFrom(await buildRepository(fixture as any)); }

describe("buildBakeCard", () => {
  it("matches core macros exactly (parity) and carries dual-unit grams", async () => {
    const s = await svc();
    // The recipe now has many versions; resolve its HEAD (what buildBakeCard renders) and
    // anchor the parity comparison there. find() returns the OLDEST version with the name,
    // so comparing exportCard(named.id) would pit two different versions against each other.
    const named = (await s.listVersions()).find((x) => x.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
    const headId = (await s.getRecipe(named.recipeId)).headVersionId;
    const core = await s.exportCard(headId);
    const card = await buildBakeCard(s, named.recipeId);
    expect(card.perServing.calories).toBe(core.macros.perServing.calories);
    expect(card.whole.calories).toBe(core.macros.total.calories);
    expect(card.calPerGramProtein).toBe(core.macros.caloriesPerGramProtein ?? null);
    const rows = card.ingredientGroups.flatMap((g) => g.items);
    expect(rows.some((r) => r.grams !== undefined && /cup|tbsp|scoop|tsp/.test(r.qtyNatural))).toBe(true);
    expect(card.ingredientGroups.some((g) => g.subRecipe)).toBe(true);
  });
});
