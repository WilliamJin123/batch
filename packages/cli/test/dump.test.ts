import { describe, it, expect } from "vitest";
import { InMemoryRepository, RecipeService, testDeps } from "@batch/core";
import type { RecipeContent } from "@batch/core";
import * as cmd from "../src/commands.js";

function svc() { return new RecipeService(new InMemoryRepository(), testDeps()); }
function cookie(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "Mix and bake", temperature: 350 }],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}
const SUGAR = { id: "ing-sugar", name: "sugar", macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 } };

// a recipe signature that survives a rebuild (ids regenerate): name + kind + macros + yield
async function signature(s: RecipeService) {
  const rows = await cmd.list(s);
  const out: Record<string, unknown> = {};
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    out[r.name] = {
      kind: r.kind,
      cal: r.kcalPerServing != null ? Math.round(r.kcalPerServing * 100) / 100 : null,
      basis: r.macroBasis,
    };
  }
  return out;
}

describe("list --kind", () => {
  it("classifies and filters by kind", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, SUGAR);
    const { version: base } = await cmd.create(s, { name: "Base Cookie", yield: { amount: 9, unit: "cookies" }, content: cookie() });
    await cmd.derive(s, { baseVersionId: base.id, name: "Low Sugar" });
    await cmd.create(s, { name: "Single", yield: { amount: 1, unit: "batch" }, content: cookie() });

    const all = await cmd.list(s);
    expect(all.find((r) => r.name === "Base Cookie")?.kind).toBe("base");
    expect(all.find((r) => r.name === "Low Sugar")?.kind).toBe("variant");
    expect(all.find((r) => r.name === "Single")?.kind).toBe("root");

    expect((await cmd.list(s, { kind: "base" })).map((r) => r.name)).toEqual(["Base Cookie"]);
    expect((await cmd.list(s, { kind: "variant" })).map((r) => r.name)).toEqual(["Low Sugar"]);
  });
});

describe("dump", () => {
  it("emits ingredients, a root create-file, a variant manifest, feedback, and a manifest", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, SUGAR);
    const { version: base } = await cmd.create(s, { name: "Base Cookie", yield: { amount: 9, unit: "cookies" }, content: cookie() });
    const { version: variant } = await cmd.derive(s, { baseVersionId: base.id, name: "Low Sugar" });
    await cmd.override(s, { versionId: variant.id, entry: { op: "replace", kind: "usage", target: "u1", payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } } });
    await cmd.feedback(s, { versionId: base.id, kind: "made", rating: "good" });

    const d = await cmd.dump(s);
    const paths = d.files.map((f) => f.path);
    expect(paths).toContain("ingredients.json");
    expect(paths).toContain("feedback.json");
    expect(paths).toContain("manifest.json");
    expect(paths.some((p) => p.endsWith(".variant.json"))).toBe(true);
    expect(paths).toContain("base-cookie.json");

    // the variant file carries its base by NAME + the auto-diffed overrides
    const variantFile = d.files.find((f) => f.path.endsWith(".variant.json"))!.json as any;
    expect(variantFile.deriveFromRecipe).toBe("Base Cookie");
    expect(variantFile.overrides).toContainEqual({ op: "replace", kind: "usage", target: "u1", payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } });
  });

  it("rewrites sub-recipe pins to by-name refs (portable across a rebuild)", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, SUGAR);
    const { version: child } = await cmd.create(s, { name: "Shared Frosting", tags: ["sub-recipe"], yield: { amount: 1, unit: "batch" }, content: cookie() });
    const parent: RecipeContent = {
      steps: [{ componentKey: "p1", order: 1, instructionText: "Assemble" }],
      slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: child.id } }],
      usages: [{ componentKey: "uf", stepKey: "p1", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" }],
    };
    await cmd.create(s, { name: "Frosted Thing", yield: { amount: 4, unit: "pieces" }, content: parent });

    const d = await cmd.dump(s);
    const parentFile = d.files.find((f) => f.path === "frosted-thing.json")!.json as any;
    const slot = parentFile.content.slots.find((sl: any) => sl.componentKey === "frosting");
    expect(slot.resolution).toEqual({ kind: "sub_recipe", subRecipeRef: "Shared Frosting" });
  });

  it("round-trips through import: a rebuilt store has the same recipe signatures (root + variant)", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, SUGAR);
    const { version: base } = await cmd.create(s, { name: "Base Cookie", description: "the base", tags: ["cookie"], yield: { amount: 9, unit: "cookies" }, content: cookie() });
    const { version: variant } = await cmd.derive(s, { baseVersionId: base.id, name: "Low Sugar" });
    const { version: v2 } = await cmd.override(s, { versionId: variant.id, entry: { op: "replace", kind: "usage", target: "u1", payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } } });
    await cmd.edit(s, { versionId: v2.id, patch: { description: "less sugar", tags: ["cookie", "light"] } });
    await cmd.feedback(s, { versionId: base.id, kind: "made", rating: "good" });

    const before = await signature(s);
    const d = await cmd.dump(s);

    const s2 = svc();
    const report = await cmd.importDump(s2, d.files);
    expect(report.recipes).toBe(2);
    expect(await signature(s2)).toEqual(before);
  });

  it("round-trips a composed recipe (sub-recipe ref re-resolves on import)", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, SUGAR);
    const { version: child } = await cmd.create(s, { name: "Shared Frosting", tags: ["sub-recipe"], yield: { amount: 1, unit: "batch" }, content: cookie() });
    const parent: RecipeContent = {
      steps: [{ componentKey: "p1", order: 1, instructionText: "Assemble" }],
      slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: child.id } }],
      usages: [{ componentKey: "uf", stepKey: "p1", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" }],
    };
    await cmd.create(s, { name: "Frosted Thing", yield: { amount: 4, unit: "pieces" }, content: parent });

    const before = await signature(s);
    const d = await cmd.dump(s);
    const s2 = svc();
    await cmd.importDump(s2, d.files);
    expect(await signature(s2)).toEqual(before);
  });
});
