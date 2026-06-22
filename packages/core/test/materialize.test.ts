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

  it("adds a note via a note override, even when the base has no notes array", () => {
    const out = materialize(baseContent(), {
      entries: [
        { op: "add", kind: "note",
          payload: { componentKey: "n1", kind: "pitfall", text: "don't overbake", stepKey: "s2" } },
      ],
    });
    expect(out.notes?.map((nt) => nt.componentKey)).toEqual(["n1"]);
    expect(out.notes?.[0]?.text).toBe("don't overbake");
  });

  it("replaces and removes a note by componentKey", () => {
    const withNote: RecipeContent = {
      ...baseContent(),
      notes: [{ componentKey: "n1", kind: "note", text: "a" }],
    };
    const replaced = materialize(withNote, {
      entries: [
        { op: "replace", kind: "note", target: "n1",
          payload: { componentKey: "n1", kind: "technique", text: "b" } },
      ],
    });
    expect(replaced.notes?.[0]).toMatchObject({ kind: "technique", text: "b" });
    const removed = materialize(withNote, { entries: [{ op: "remove", kind: "note", target: "n1" }] });
    expect(removed.notes).toHaveLength(0);
  });
});
