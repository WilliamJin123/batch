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
});
