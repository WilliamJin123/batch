import { describe, it, expect } from "vitest";
import { materialize } from "../src/materialize.js";
import type { RecipeContent, OverrideSet } from "../src/types.js";

function baseContent(): RecipeContent {
  return {
    steps: [
      { componentKey: "s1", order: 1, instructionText: "Mix", timerSeconds: 60 },
      { componentKey: "s2", order: 2, instructionText: "Bake", temperature: 350 },
    ],
    slots: [
      { componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } },
    ],
    usages: [
      { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" },
    ],
  };
}

describe("materialize", () => {
  it("returns base content unchanged when override set is empty", () => {
    const out = materialize(baseContent(), { entries: [] });
    expect(out).toEqual(baseContent());
  });

  it("does not mutate the base content", () => {
    const base = baseContent();
    materialize(base, { entries: [{ op: "remove", kind: "slot", target: "sugar" }] });
    expect(base.slots).toHaveLength(1);
  });

  it("replaces a component by componentKey", () => {
    const out = materialize(baseContent(), {
      entries: [
        { op: "replace", kind: "usage", target: "u1",
          payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 150, quantityUnit: "g" } },
      ],
    });
    expect(out.usages[0]?.quantityValue).toBe(150);
  });

  it("removes a component by componentKey", () => {
    const out = materialize(baseContent(), {
      entries: [{ op: "remove", kind: "step", target: "s2" }],
    });
    expect(out.steps.map((s) => s.componentKey)).toEqual(["s1"]);
  });

  it("adds a new component", () => {
    const out = materialize(baseContent(), {
      entries: [
        { op: "add", kind: "slot",
          payload: { componentKey: "banana", name: "banana", resolution: { kind: "raw", libraryIngredientId: "ing-banana" } } },
      ],
    });
    expect(out.slots.map((s) => s.componentKey)).toEqual(["sugar", "banana"]);
  });

  it("applies entries in order (later replace wins)", () => {
    const set: OverrideSet = {
      entries: [
        { op: "replace", kind: "step", target: "s2",
          payload: { componentKey: "s2", order: 2, instructionText: "Bake", temperature: 340 } },
        { op: "replace", kind: "step", target: "s2",
          payload: { componentKey: "s2", order: 2, instructionText: "Bake", temperature: 360 } },
      ],
    };
    const out = materialize(baseContent(), set);
    expect(out.steps.find((s) => s.componentKey === "s2")?.temperature).toBe(360);
  });
});
