import type { ComponentKind, IngredientSlot, OverrideEntry, RecipeContent, Step, StepUsage } from "./types.js";

type Component = Step | IngredientSlot | StepUsage;

function indexOf(c: RecipeContent, kind: ComponentKind): Map<string, Component> {
  const arr: Component[] = kind === "step" ? c.steps : kind === "slot" ? c.slots : c.usages;
  return new Map(arr.map((x) => [x.componentKey, x]));
}
function addEntry(kind: ComponentKind, payload: Component): OverrideEntry {
  if (kind === "step") return { op: "add", kind: "step", payload: payload as Step };
  if (kind === "slot") return { op: "add", kind: "slot", payload: payload as IngredientSlot };
  return { op: "add", kind: "usage", payload: payload as StepUsage };
}
function replaceEntry(kind: ComponentKind, target: string, payload: Component): OverrideEntry {
  if (kind === "step") return { op: "replace", kind: "step", target, payload: payload as Step };
  if (kind === "slot") return { op: "replace", kind: "slot", target, payload: payload as IngredientSlot };
  return { op: "replace", kind: "usage", target, payload: payload as StepUsage };
}

/**
 * The OverrideEntry list that turns `base` into `variant`: materialize(base, {entries}) reproduces
 * `variant` (components are keyed by componentKey; array order isn't semantic). Ordered so a replay
 * never orphans a reference — adds (slots/steps before usages), then replaces, then removes
 * (usages before the slots/steps they point at). Pure; the inverse of `materialize` for one delta,
 * and the auto-diff a variant dump records instead of a hand-authored override manifest.
 */
export function diffContent(base: RecipeContent, variant: RecipeContent): OverrideEntry[] {
  const entries: OverrideEntry[] = [];
  const same = (a: Component | undefined, b: Component | undefined) => JSON.stringify(a) === JSON.stringify(b);
  // adds: slots + steps before usages (a usage references a slot + step)
  for (const kind of ["slot", "step", "usage"] as const) {
    const b = indexOf(base, kind), v = indexOf(variant, kind);
    for (const [k, comp] of v) if (!b.has(k)) entries.push(addEntry(kind, comp));
  }
  // replaces: a shared key whose value changed
  for (const kind of ["step", "slot", "usage"] as const) {
    const b = indexOf(base, kind), v = indexOf(variant, kind);
    for (const [k, comp] of v) if (b.has(k) && !same(b.get(k), comp)) entries.push(replaceEntry(kind, k, comp));
  }
  // removes: usages before the slots/steps they reference
  for (const kind of ["usage", "slot", "step"] as const) {
    const b = indexOf(base, kind), v = indexOf(variant, kind);
    for (const k of b.keys()) if (!v.has(k)) entries.push({ op: "remove", kind, target: k });
  }
  return entries;
}
