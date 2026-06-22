import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "../source/db";
import { buildBakeCard, splitNotes } from "./bakeCard";

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

describe("splitNotes", () => {
  it("routes every pitfall + unanchored notes to the panel, and anchors notes to their step", () => {
    const { panel, byStep } = splitNotes([
      { componentKey: "n1", kind: "pitfall", text: "overbake", stepKey: "s2" },
      { componentKey: "n2", kind: "technique", text: "slap pan", stepKey: "s2" },
      { componentKey: "n3", kind: "technique", text: "room temp" },
    ]);
    // panel = the anchored pitfall (still previews up top) + the unanchored technique
    expect(panel.map((p) => p.text)).toEqual(["overbake", "room temp"]);
    // both notes anchored to s2 render inline there
    expect(byStep.get("s2")?.map((p) => p.text)).toEqual(["overbake", "slap pan"]);
    expect(byStep.size).toBe(1);
  });

  it("tolerates undefined", () => {
    expect(splitNotes(undefined)).toEqual({ panel: [], byStep: new Map() });
  });
});
