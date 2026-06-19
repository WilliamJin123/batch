import { describe, it, expect } from "vitest";
import { materialize } from "../src/materialize.js";
import { buildRebasePlan } from "../src/rebase.js";
import type { OverrideSet, RecipeContent } from "../src/types.js";

// A base content with usages keyed u-sugar / u-corn (corn optional) and a step s1.
function base(sugar: number, corn?: number): RecipeContent {
  const slots = [{ componentKey: "sl-sugar", name: "sugar", resolution: { kind: "raw" as const, libraryIngredientId: "ing-sugar" } }];
  const usages = [{ componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: sugar, quantityUnit: "g" }];
  if (corn !== undefined) {
    slots.push({ componentKey: "sl-corn", name: "corn", resolution: { kind: "raw" as const, libraryIngredientId: "ing-corn" } });
    usages.push({ componentKey: "u-corn", stepKey: "s1", slotKey: "sl-corn", quantityValue: corn, quantityUnit: "g" });
  }
  return { steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }], slots, usages };
}
const empty: OverrideSet = { entries: [], name: "V" };

describe("buildRebasePlan (CM-5)", () => {
  it("clean propagate: a base change the variant didn't touch flows in, no conflicts", () => {
    const b0 = base(100), b1 = base(80); // base cut sugar; variant only overrides the step
    const variant: OverrideSet = { name: "V", entries: [
      { op: "replace", kind: "step", target: "s1", payload: { componentKey: "s1", order: 1, instructionText: "bake longer" } },
    ] };
    const plan = buildRebasePlan(b0, b1, variant);
    expect(plan.conflicts).toEqual([]);
    const out = materialize(b1, plan.overrideSet);
    expect(out.usages.find((u) => u.componentKey === "u-sugar")?.quantityValue).toBe(80); // propagated
    expect(out.steps[0]?.instructionText).toBe("bake longer"); // variant kept
  });

  it("both-changed: variant wins and the collision is reported", () => {
    const b0 = base(100, 20), b1 = base(100, 30); // base changed corn 20→30
    const variant: OverrideSet = { name: "V", entries: [
      { op: "replace", kind: "usage", target: "u-corn",
        payload: { componentKey: "u-corn", stepKey: "s1", slotKey: "sl-corn", quantityValue: 25, quantityUnit: "g" } },
    ] };
    const plan = buildRebasePlan(b0, b1, variant);
    const out = materialize(b1, plan.overrideSet);
    expect(out.usages.find((u) => u.componentKey === "u-corn")?.quantityValue).toBe(25); // variant-wins
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({ kind: "usage", componentKey: "u-corn", type: "both-changed" });
    expect((plan.conflicts[0]?.baseNew as any).quantityValue).toBe(30);
    expect((plan.conflicts[0]?.variant as any).quantityValue).toBe(25);
  });

  it("base-removed a component the variant replaces: re-added (variant-wins) + reported", () => {
    const b0 = base(100, 20), b1 = base(100); // base dropped corn entirely
    const variant: OverrideSet = { name: "V", entries: [
      { op: "replace", kind: "usage", target: "u-corn",
        payload: { componentKey: "u-corn", stepKey: "s1", slotKey: "sl-corn", quantityValue: 25, quantityUnit: "g" } },
      { op: "replace", kind: "slot", target: "sl-corn",
        payload: { componentKey: "sl-corn", name: "corn", resolution: { kind: "raw", libraryIngredientId: "ing-corn" } } },
    ] };
    const plan = buildRebasePlan(b0, b1, variant);
    const out = materialize(b1, plan.overrideSet); // must NOT throw
    expect(out.usages.find((u) => u.componentKey === "u-corn")?.quantityValue).toBe(25);
    expect(plan.conflicts.some((c) => c.componentKey === "u-corn" && c.type === "base-removed")).toBe(true);
  });

  it("both removed the same component: no conflict, no throw", () => {
    const b0 = base(100, 20), b1 = base(100); // base removed corn
    const variant: OverrideSet = { name: "V", entries: [
      { op: "remove", kind: "usage", target: "u-corn" },
      { op: "remove", kind: "slot", target: "sl-corn" },
    ] };
    const plan = buildRebasePlan(b0, b1, variant);
    expect(plan.conflicts).toEqual([]);
    const out = materialize(b1, plan.overrideSet); // must NOT throw on remove-of-missing
    expect(out.usages.some((u) => u.componentKey === "u-corn")).toBe(false);
  });

  it("empty override set rebases to exactly the new base", () => {
    const plan = buildRebasePlan(base(100), base(80), empty);
    expect(plan.conflicts).toEqual([]);
    expect(materialize(base(80), plan.overrideSet)).toEqual(base(80));
  });

  it("add of a key base-new already has is rewritten to replace (no throw, no duplicate)", () => {
    const b0 = base(100), b1 = base(100); // base left u-sugar untouched
    const variant: OverrideSet = { name: "V", entries: [
      { op: "add", kind: "usage",
        payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 50, quantityUnit: "g" } },
    ] };
    const plan = buildRebasePlan(b0, b1, variant);
    expect(plan.conflicts).toEqual([]); // base didn't touch u-sugar
    const out = materialize(b1, plan.overrideSet); // must NOT throw (add→replace) and must not duplicate the key
    expect(out.usages.filter((u) => u.componentKey === "u-sugar")).toHaveLength(1);
    expect(out.usages.find((u) => u.componentKey === "u-sugar")?.quantityValue).toBe(50); // variant value wins
  });
});
