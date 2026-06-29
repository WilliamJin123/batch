import { describe, it, expect } from "vitest";
import { InMemoryRepository, RecipeService, testDeps } from "@batch/core";
import type { RecipeContent } from "@batch/core";
import * as cmd from "../src/commands.js";

function content(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "Mix and bake", temperature: 350 }],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}
function svc() { return new RecipeService(new InMemoryRepository(), testDeps()); }

describe("commands", () => {
  it("create returns recipe + version and is retrievable via show", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content() });
    const shown = await cmd.show(s, version.id);
    expect(shown.name).toBe("Brownies");
    expect(shown.content.usages[0]?.quantityValue).toBe(200);
  });

  it("derive then override pins one component but inherits the rest", async () => {
    const s = svc();
    const { version: base } = await cmd.create(s, { name: "Base", yield: { amount: 16, unit: "squares" }, content: content() });
    const { version: variant } = await cmd.derive(s, { baseVersionId: base.id, name: "Low-sugar" });
    const { version: v2 } = await cmd.override(s, {
      versionId: variant.id,
      entry: { op: "replace", kind: "usage", target: "u1",
        payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } },
      message: "cut sugar",
    });
    const shown = await cmd.show(s, v2.id);
    expect(shown.content.usages[0]?.quantityValue).toBe(120);
    expect(shown.content.steps[0]?.instructionText).toBe("Mix and bake");
  });

  it("edit changes metadata; history walks newest-first", async () => {
    const s = svc();
    const { version: v1 } = await cmd.create(s, { name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const { version: v2 } = await cmd.edit(s, { versionId: v1.id, patch: { name: "B", status: "approved" } });
    const hist = await cmd.history(s, v2.id);
    expect(hist.map((h) => h.name)).toEqual(["B", "A"]);
    expect(v2.status).toBe("approved");
  });

  it("scale halves quantities for a half batch", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "A", yield: { amount: 16, unit: "squares" }, content: content() });
    const scaled = await cmd.scale(s, version.id, 8);
    expect(scaled.usages[0]?.quantityValue).toBe(100);
  });

  it("list summarizes recipes by head version", async () => {
    const s = svc();
    const { version: base } = await cmd.create(s, { name: "Base", yield: { amount: 1, unit: "x" }, content: content() });
    await cmd.derive(s, { baseVersionId: base.id, name: "Variant" });
    const rows = await cmd.list(s);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name).sort()).toEqual(["Base", "Variant"]);
  });

  it("tree shows derivation edges (variant points at its base version)", async () => {
    const s = svc();
    const { version: base } = await cmd.create(s, { name: "Base", yield: { amount: 1, unit: "x" }, content: content() });
    const { version: variant } = await cmd.derive(s, { baseVersionId: base.id, name: "Variant" });
    const nodes = await cmd.tree(s);
    const variantNode = nodes.find((n) => n.versionId === variant.id);
    expect(variantNode?.derivesFromVersionId).toBe(base.id);
  });

  it("ingredient add slugifies the name and lists it", async () => {
    const s = svc();
    const ing = await cmd.ingredientAdd(s, {
      name: "White Sugar", macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 },
    });
    expect(ing.id).toBe("ing-white-sugar");
    expect(await cmd.ingredientList(s)).toHaveLength(1);
  });

  it("macros are partial before the ingredient exists, complete after add + recompute", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "Base", yield: { amount: 2, unit: "servings" }, content: content() });
    expect((await cmd.macros(s, version.id))?.basis).toBe("partial");
    await cmd.ingredientAdd(s, {
      id: "ing-sugar", name: "sugar", macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 },
    });
    const { version: recomputed } = await cmd.recompute(s, version.id);
    expect(recomputed.macros?.basis).toBe("complete");
    expect(recomputed.macros?.total.calories).toBe(774);
  });

  it("show flattens a composed recipe by default; --structure keeps the sub_recipe pin", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, { id: "ing-cc", name: "cc", macrosPer100g: { calories: 233, protein: 6, carbs: 8, fat: 19, fiber: 0 } });
    const { version: frost } = await cmd.create(s, {
      name: "Frosting", yield: { amount: 1, unit: "batch" },
      content: {
        steps: [{ componentKey: "beat", order: 1, instructionText: "Beat" }],
        slots: [{ componentKey: "cc", name: "cc", resolution: { kind: "raw", libraryIngredientId: "ing-cc" } }],
        usages: [{ componentKey: "ucc", stepKey: "beat", slotKey: "cc", quantityValue: 100, quantityUnit: "g" }],
      },
    });
    const { version: cookie } = await cmd.create(s, {
      name: "Cookie", yield: { amount: 4, unit: "cookies" },
      content: {
        steps: [{ componentKey: "frost", order: 1, instructionText: "Frost" }],
        slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: frost.id } }],
        usages: [{ componentKey: "uf", stepKey: "frost", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" }],
      },
    });

    const flat = await cmd.show(s, cookie.id);
    expect(flat.content.slots.some((sl) => sl.resolution.kind === "sub_recipe")).toBe(false);
    expect(flat.content.usages.find((u) => u.slotKey === "frosting/cc")?.quantityValue).toBe(100);
    expect(flat.sources?.[0]?.recipeName).toBe("Frosting");

    const struct = await cmd.show(s, cookie.id, { structure: true });
    expect(struct.content.slots.some((sl) => sl.resolution.kind === "sub_recipe")).toBe(true);
    expect(struct.sources).toBeUndefined();
    expect(struct.pins?.[0]?.slotKey).toBe("frosting"); // pins annotated with staleness for managing/swapping
    expect(struct.pins?.[0]?.behind).toBe(0);
  });

  it("feedback: append made + component-scoped made, then list shows current verdicts", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "Cookie", yield: { amount: 3, unit: "cookies" }, content: content() });
    await cmd.feedback(s, { versionId: version.id, kind: "made", rating: "good", notes: "great" });
    await cmd.feedback(s, { versionId: version.id, kind: "made", rating: "bad", component: "sugar", notes: "too sweet" });
    const view = await cmd.feedbackList(s, version.id);
    expect(view.current.dish?.rating).toBe("good");
    expect(view.current.components["sugar"]?.rating).toBe("bad");
    expect(view.history).toHaveLength(2);
  });

  it("feedback rm deletes an entry", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const fb = await cmd.feedback(s, { versionId: version.id, kind: "to-make" });
    await cmd.feedbackRemove(s, fb.id);
    expect((await cmd.feedbackList(s, version.id)).history).toEqual([]);
  });

  it("list carries feedback markers and --to-make filters to the queue", async () => {
    const s = svc();
    const { version: a } = await cmd.create(s, { name: "Made-Good", yield: { amount: 1, unit: "x" }, content: content() });
    const { version: b } = await cmd.create(s, { name: "Wishlist", yield: { amount: 1, unit: "x" }, content: content() });
    await cmd.create(s, { name: "Untouched", yield: { amount: 1, unit: "x" }, content: content() });
    await cmd.feedback(s, { versionId: a.id, kind: "made", rating: "good" });
    await cmd.feedback(s, { versionId: b.id, kind: "to-make" });

    const all = await cmd.list(s);
    expect(all.find((r) => r.name === "Made-Good")).toMatchObject({ tried: true, queued: false, verdict: "good" });
    expect(all.find((r) => r.name === "Wishlist")).toMatchObject({ tried: false, queued: true });
    expect(all.find((r) => r.name === "Untouched")).toMatchObject({ tried: false, queued: false });

    const queue = await cmd.list(s, { toMake: true });
    expect(queue.map((r) => r.name)).toEqual(["Wishlist"]);
  });

  it("create records provenance and tree surfaces parent edges (CM-7)", async () => {
    const s = svc();
    const a = await cmd.create(s, { name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const b = await cmd.create(s, { name: "B", yield: { amount: 1, unit: "x" }, content: content() });
    const champ = await cmd.create(s, {
      name: "Champion", yield: { amount: 1, unit: "x" }, content: content(),
      parents: [a.version.id, b.version.id], rationale: "blend",
    });
    expect(champ.version.parentVersionIds).toEqual([a.version.id, b.version.id]);
    expect(champ.version.provenanceNote).toBe("blend");
    const node = (await cmd.tree(s)).find((n) => n.versionId === champ.version.id);
    expect(node?.parentVersionIds).toEqual([a.version.id, b.version.id]);
  });

  it("compare aligns two recipes by ingredient (CM-3)", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, { id: "ing-sugar", name: "Sugar", macrosPer100g: { calories: 400, protein: 0, carbs: 100, fat: 0, fiber: 0 } });
    const a = await cmd.create(s, { name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const b = await cmd.create(s, { name: "B", yield: { amount: 1, unit: "x" }, content: content() });
    const view = await cmd.compare(s, [a.version.id, b.version.id]);
    expect(view.columns).toHaveLength(2);
    const sugar = view.ingredients.find((r) => r.ingredientId === "ing-sugar")!;
    expect(sugar.perServingGrams[a.version.id]).toBe(200); // content() uses 200g sugar, yield amount 1
  });

  it("rebase propagates a base change to a variant and reports no conflict", async () => {
    const s = svc();
    const base = await cmd.create(s, { name: "Base", yield: { amount: 1, unit: "x" }, content: content() });
    const variant = await cmd.derive(s, { baseVersionId: base.version.id, name: "V" });
    const base2 = await cmd.override(s, { versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u1",
      payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } } });
    const { version, conflicts } = await cmd.rebase(s, { variantVersionId: variant.version.id, ontoVersionId: base2.version.id });
    expect(conflicts).toEqual([]);
    expect(version.content.usages[0]?.quantityValue).toBe(120);
  });

  it("rebaseAll rebases all variants of a base", async () => {
    const s = svc();
    const base = await cmd.create(s, { name: "Base", yield: { amount: 1, unit: "x" }, content: content() });
    await cmd.derive(s, { baseVersionId: base.version.id, name: "VA" });
    await cmd.derive(s, { baseVersionId: base.version.id, name: "VB" });
    const base2 = await cmd.override(s, { versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u1",
      payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 90, quantityUnit: "g" } } });
    const { results } = await cmd.rebaseAll(s, base2.version.id);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.version.content.usages[0]?.quantityValue === 90)).toBe(true);
  });

  it("promote bakes a winning ingredient from a source into a base, with its usage (CM-4)", async () => {
    const s = svc();
    const withCorn: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }],
      slots: [
        { componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } },
        { componentKey: "sl-corn", name: "corn", resolution: { kind: "raw", libraryIngredientId: "ing-corn" } },
      ],
      usages: [
        { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" },
        { componentKey: "u-corn", stepKey: "s1", slotKey: "sl-corn", quantityValue: 12, quantityUnit: "g" },
      ],
    };
    const winner = await cmd.create(s, { name: "Winner", yield: { amount: 1, unit: "x" }, content: withCorn });
    const base = await cmd.create(s, { name: "Base", yield: { amount: 1, unit: "x" }, content: content() });
    const { version } = await cmd.promote(s, { targetVersionId: base.version.id, sourceVersionId: winner.version.id, componentKeys: ["sl-corn"] });
    expect(version.content.usages.find((u) => u.componentKey === "u-corn")?.quantityValue).toBe(12);
  });

  it("resolves a recipe by name across read commands", async () => {
    const s = svc();
    await cmd.create(s, { name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content() });
    expect((await cmd.show(s, "Brownies")).name).toBe("Brownies");
    expect((await cmd.history(s, "brownies")).length).toBe(1);
  });

  it("list filters by tag and by name substring", async () => {
    const s = svc();
    await cmd.create(s, { name: "Turtle Cheesecake", tags: ["cheesecake", "turtle"], yield: { amount: 8, unit: "slices" }, content: content() });
    await cmd.create(s, { name: "Banana Bread", tags: ["bread"], yield: { amount: 8, unit: "slices" }, content: content() });
    expect((await cmd.list(s, { tag: "cheesecake" })).map((r) => r.name)).toEqual(["Turtle Cheesecake"]);
    expect((await cmd.list(s, { name: "banana" })).map((r) => r.name)).toEqual(["Banana Bread"]);
  });

  it("ingredient show resolves by id or name", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, { name: "White Sugar", macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 } });
    expect((await cmd.ingredientShow(s, "white sugar")).id).toBe("ing-white-sugar");
    expect((await cmd.ingredientShow(s, "ing-white-sugar")).name).toBe("White Sugar");
  });

  it("macrosBySection groups contributions by recipe section", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, { id: "ing-sugar", name: "sugar", macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 } });
    const { version } = await cmd.create(s, { name: "Sectioned", yield: { amount: 2, unit: "x" }, content: content() });
    const { bySection } = await cmd.macrosBySection(s, version.id);
    expect(bySection["Base"]?.calories).toBe(774); // content()'s unsectioned step → "Base"; 200 g sugar
  });

  it("export renders a markdown card (md) and a machine view (json)", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, { id: "ing-sugar", name: "sugar", macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 } });
    await cmd.create(s, { name: "Card Test", yield: { amount: 2, unit: "servings" }, content: content() });
    const md = await cmd.exportRecipe(s, "Card Test", { format: "md" });
    expect(typeof md).toBe("string");
    expect(md as string).toMatch(/^# Card Test/m);
    const json = await cmd.exportRecipe(s, "Card Test", { format: "json" });
    expect((json as { macros: { total: { calories: number } } }).macros.total.calories).toBe(774);
  });

  it("applyOverrides applies many entries as ONE atomic version (later entries see earlier ones)", async () => {
    const s = svc();
    const { version: base } = await cmd.create(s, { name: "Base", yield: { amount: 16, unit: "squares" }, content: content() });
    const { version } = await cmd.applyOverrides(s, {
      versionId: base.id,
      entries: [
        { op: "replace", kind: "usage", target: "u1",
          payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } },
        // a second step added in the same commit...
        { op: "add", kind: "step", payload: { componentKey: "s2", order: 2, instructionText: "Cool" } },
        // ...and a note targeting that just-added step proves entries fold in order within one call.
        { op: "add", kind: "note", payload: { componentKey: "n1", kind: "technique", stepKey: "s2", text: "Cool fully" } },
      ],
      message: "tune sugar + add cool step",
    });
    const shown = await cmd.show(s, version.id);
    expect(shown.content.usages[0]?.quantityValue).toBe(120);
    expect(shown.content.steps.map((x) => x.componentKey)).toEqual(["s1", "s2"]);
    expect(shown.content.notes?.[0]?.text).toBe("Cool fully");
    expect(version.commitMessage).toBe("tune sugar + add cool step");
    // Exactly one new version — the whole point of atomic: base → head, no intermediate commits.
    const hist = await cmd.history(s, version.id);
    expect(hist).toHaveLength(2);
  });

  it("ingredientSet merges unit-equivalences and macros, leaving the rest intact", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, {
      id: "ing-egg-whole", name: "egg", macrosPer100g: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 },
      unitEquivalences: { each: 44, serving: 44 },
    });
    const set = await cmd.ingredientSet(s, "egg", { unitEquivalences: { each: 50, serving: 50 }, macrosPer100g: { protein: 13 } });
    expect(set.unitEquivalences).toEqual({ each: 50, serving: 50 });
    expect(set.macrosPer100g.protein).toBe(13);   // patched
    expect(set.macrosPer100g.calories).toBe(143); // untouched fields survive the merge
    expect((await cmd.ingredientList(s))).toHaveLength(1); // upsert in place, not a duplicate
  });

  it("ingredientSet stamps a substitution category in place", async () => {
    const s = svc();
    await cmd.ingredientAdd(s, { id: "ing-prot-van", name: "vanilla protein", macrosPer100g: { calories: 400, protein: 80, carbs: 5, fat: 3, fiber: 0 } });
    const set = await cmd.ingredientSet(s, "vanilla protein", { category: "protein-powder" });
    expect(set.category).toBe("protein-powder");
    expect(set.macrosPer100g.protein).toBe(80); // category is macro-inert
  });
});

describe("list ingredient filters (--with / --without / --allow-sub)", () => {
  const M = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const raw = (key: string, ing: string) => ({ componentKey: key, name: key, resolution: { kind: "raw", libraryIngredientId: ing } as const });
  const flat = (key: string, ing: string): RecipeContent => ({
    steps: [{ componentKey: "s1", order: 1, instructionText: "mix" }],
    slots: [raw("sl", ing)],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sl", quantityValue: 50, quantityUnit: "g" }],
  });

  // vanilla & chocolate protein are one substitution family; sugar/flour stand alone.
  async function world() {
    const s = svc();
    await cmd.ingredientAdd(s, { id: "ing-prot-van", name: "vanilla protein", category: "protein-powder", macrosPer100g: M });
    await cmd.ingredientAdd(s, { id: "ing-prot-choc", name: "chocolate protein", category: "protein-powder", macrosPer100g: M });
    await cmd.ingredientAdd(s, { id: "ing-sugar", name: "sugar", macrosPer100g: M });
    await cmd.ingredientAdd(s, { id: "ing-flour", name: "flour", macrosPer100g: M });
    await cmd.create(s, { name: "Vanilla Bar", yield: { amount: 1, unit: "x" }, content: flat("a", "ing-prot-van") });
    await cmd.create(s, { name: "Choc Bar", yield: { amount: 1, unit: "x" }, content: flat("b", "ing-prot-choc") });
    await cmd.create(s, { name: "Plain", yield: { amount: 1, unit: "x" }, content: flat("c", "ing-sugar") });
    // a composed recipe whose chocolate protein lives only inside a sub-recipe crust
    const { version: crust } = await cmd.create(s, { name: "Choc Crust", yield: { amount: 1, unit: "batch" }, content: flat("k", "ing-prot-choc") });
    await cmd.create(s, {
      name: "Composed", yield: { amount: 8, unit: "slices" },
      content: {
        steps: [{ componentKey: "s1", order: 1, instructionText: "assemble" }],
        slots: [raw("sl-sugar", "ing-sugar"), { componentKey: "sl-crust", name: "crust", resolution: { kind: "sub_recipe", subRecipeVersionId: crust.id } }],
        usages: [
          { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 100, quantityUnit: "g" },
          { componentKey: "u-crust", stepKey: "s1", slotKey: "sl-crust", quantityValue: 1, quantityUnit: "batch" },
        ],
      },
    });
    return s;
  }
  const names = (rows: cmd.ListRow[]) => rows.map((r) => r.name).sort();

  it("--with keeps only recipes containing the ingredient, counting sub-recipe ingredients", async () => {
    const s = await world();
    // Composed gets in via its crust, which flattening splices in — proves the set is computed on flattened content
    expect(names(await cmd.list(s, { with: ["ing-prot-choc"] }))).toEqual(["Choc Bar", "Choc Crust", "Composed"]);
  });

  it("--without literally excludes recipes using the ingredient (resolves by name too)", async () => {
    const s = await world();
    const rows = await cmd.list(s, { without: ["vanilla protein"] });
    expect(names(rows)).not.toContain("Vanilla Bar");
    expect(rows.every((r) => r.swappable === undefined)).toBe(true); // no --allow-sub → no swap annotations
  });

  it("--without --allow-sub keeps a swappable hit and flags what to swap out", async () => {
    const s = await world();
    const rows = await cmd.list(s, { without: ["ing-prot-van"], allowSub: true });
    const van = rows.find((r) => r.name === "Vanilla Bar");
    expect(van?.swappable).toEqual(["vanilla protein"]); // kept, because chocolate protein can stand in
  });

  it("--with --allow-sub accepts a same-family stand-in and names the in-recipe ingredient", async () => {
    const s = await world();
    const rows = await cmd.list(s, { with: ["ing-prot-choc"], allowSub: true });
    expect(names(rows)).toEqual(["Choc Bar", "Choc Crust", "Composed", "Vanilla Bar"]);
    expect(rows.find((r) => r.name === "Vanilla Bar")?.swappable).toEqual(["vanilla protein"]);
    expect(rows.find((r) => r.name === "Choc Bar")?.swappable).toBeUndefined(); // exact match, nothing to swap
    expect(names(rows)).not.toContain("Plain"); // no protein powder at all → no stand-in
  });

  it("a non-substitutable ingredient is excluded even under --allow-sub", async () => {
    const s = await world();
    // sugar has no category, so --without sugar can't be forgiven
    const rows = await cmd.list(s, { without: ["ing-sugar"], allowSub: true });
    expect(names(rows)).toEqual(["Choc Bar", "Choc Crust", "Vanilla Bar"]); // Plain + Composed (the sugar users) dropped
    expect(rows.every((r) => r.swappable === undefined)).toBe(true); // nothing was swap-forgiven
  });

  it("an unknown ingredient ref fails fast", async () => {
    const s = await world();
    await expect(cmd.list(s, { with: ["ing-nonexistent"] })).rejects.toThrow();
  });
});
