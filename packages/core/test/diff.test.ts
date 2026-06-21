import { describe, it, expect } from "vitest";
import { diffContent } from "../src/diff.js";
import { materialize } from "../src/materialize.js";
import type { RecipeContent } from "../src/types.js";

function base(): RecipeContent {
  return {
    steps: [
      { componentKey: "s1", order: 1, instructionText: "Mix", temperature: 350 },
      { componentKey: "s2", order: 2, instructionText: "Bake" },
    ],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}

// compare two contents ignoring array order (components are keyed; order isn't semantic)
function sortedKeys(c: RecipeContent) {
  const by = (a: { componentKey: string }, b: { componentKey: string }) => a.componentKey.localeCompare(b.componentKey);
  return {
    steps: [...c.steps].sort(by), slots: [...c.slots].sort(by), usages: [...c.usages].sort(by),
  };
}

describe("diffContent", () => {
  it("round-trips a replaced usage (apply the diff to base → variant)", () => {
    const b = base();
    const v = base();
    v.usages[0]!.quantityValue = 120;
    const entries = diffContent(b, v);
    expect(entries).toContainEqual({ op: "replace", kind: "usage", target: "u1", payload: v.usages[0]! });
    expect(sortedKeys(materialize(b, { entries }))).toEqual(sortedKeys(v));
  });

  it("round-trips an added slot + usage", () => {
    const b = base();
    const v = base();
    v.slots.push({ componentKey: "salt", name: "salt", resolution: { kind: "raw", libraryIngredientId: "ing-salt" } });
    v.usages.push({ componentKey: "u2", stepKey: "s1", slotKey: "salt", quantityValue: 1, quantityUnit: "g" });
    const entries = diffContent(b, v);
    expect(entries.filter((e) => e.op === "add")).toHaveLength(2);
    expect(sortedKeys(materialize(b, { entries }))).toEqual(sortedKeys(v));
  });

  it("round-trips a removed step", () => {
    const b = base();
    const v = base();
    v.steps = v.steps.filter((s) => s.componentKey !== "s2");
    const entries = diffContent(b, v);
    expect(entries).toContainEqual({ op: "remove", kind: "step", target: "s2" });
    expect(sortedKeys(materialize(b, { entries }))).toEqual(sortedKeys(v));
  });

  it("emits nothing for identical content", () => {
    expect(diffContent(base(), base())).toEqual([]);
  });

  it("orders adds (slots/steps) before usages and removes after, so replay never orphans a reference", () => {
    const b = base();
    const v: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "Mix", temperature: 350 }], // s2 removed
      slots: [
        { componentKey: "flour", name: "flour", resolution: { kind: "raw", libraryIngredientId: "ing-flour" } }, // sugar removed, flour added
      ],
      usages: [{ componentKey: "u2", stepKey: "s1", slotKey: "flour", quantityValue: 30, quantityUnit: "g" }], // u1 removed, u2 added
    };
    const entries = diffContent(b, v);
    const addSlot = entries.findIndex((e) => e.op === "add" && e.kind === "slot");
    const addUsage = entries.findIndex((e) => e.op === "add" && e.kind === "usage");
    const removeUsage = entries.findIndex((e) => e.op === "remove" && e.kind === "usage");
    const removeSlot = entries.findIndex((e) => e.op === "remove" && e.kind === "slot");
    expect(addSlot).toBeLessThan(addUsage);       // add the slot before the usage that references it
    expect(removeUsage).toBeLessThan(removeSlot); // remove the usage before the slot it references
    expect(sortedKeys(materialize(b, { entries }))).toEqual(sortedKeys(v));
  });
});
