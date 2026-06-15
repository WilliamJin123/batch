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
});
