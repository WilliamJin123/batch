import type {
  ComponentKey, ComponentKind, IngredientSlot, OverrideEntry, OverrideSet,
  RecipeContent, Step, StepUsage,
} from "./types.js";

type Component = Step | IngredientSlot | StepUsage;

export interface RebaseConflict {
  kind: ComponentKind;
  componentKey: ComponentKey;
  /** `base-removed` = base-new dropped a component the variant overrides; else both changed it. */
  type: "both-changed" | "base-removed";
  baseNew: Component | null;   // value in base-new (null if base removed it)
  variant: Component | null;   // variant's net value (null if the variant removes it)
}
export interface RebasePlan {
  overrideSet: OverrideSet;    // reconciled — safe to materialize against base-new (never throws)
  conflicts: RebaseConflict[];
}

const KINDS: ComponentKind[] = ["step", "slot", "usage"];

function indexFor(c: RecipeContent, kind: ComponentKind): Map<ComponentKey, Component> {
  const arr: Component[] =
    kind === "step" ? c.steps : kind === "slot" ? c.slots : c.usages;
  return new Map(arr.map((x) => [x.componentKey, x]));
}

/** Keys whose presence or value differs between base-old and base-new, as `${kind}:${key}`. */
function changedKeys(b0: RecipeContent, b1: RecipeContent): Set<string> {
  const out = new Set<string>();
  for (const kind of KINDS) {
    const i0 = indexFor(b0, kind), i1 = indexFor(b1, kind);
    for (const k of new Set([...i0.keys(), ...i1.keys()])) {
      if (JSON.stringify(i0.get(k)) !== JSON.stringify(i1.get(k))) out.add(`${kind}:${k}`);
    }
  }
  return out;
}

/**
 * Build an OverrideEntry that adds a component of the given kind.
 * The discriminated union requires matching kind + payload types.
 */
function makeAddEntry(kind: ComponentKind, payload: Component): OverrideEntry {
  if (kind === "step") return { op: "add", kind: "step", payload: payload as Step };
  if (kind === "slot") return { op: "add", kind: "slot", payload: payload as IngredientSlot };
  return { op: "add", kind: "usage", payload: payload as StepUsage };
}

/**
 * Rebase a variant's delta onto an improved base (CM-5). Re-applies the variant's overrides on
 * base-new; base changes the variant didn't touch flow in for free. Collisions resolve variant-wins
 * and are reported. The reconciled override set is safe to `materialize` (replace/remove of a
 * base-removed key is converted to add / dropped, so it never throws).
 */
export function buildRebasePlan(
  baseOld: RecipeContent, baseNew: RecipeContent, variant: OverrideSet,
): RebasePlan {
  // working content (per kind) starts as base-new and is mutated as we apply the variant's entries.
  const working: Record<ComponentKind, Map<ComponentKey, Component>> = {
    step: indexFor(baseNew, "step"),
    slot: indexFor(baseNew, "slot"),
    usage: indexFor(baseNew, "usage"),
  };
  const reconciled: OverrideEntry[] = [];
  // All keys the variant explicitly touched in a way that needs conflict-checking:
  // add/replace always; remove only when base-new still has the key (both-removed is not a conflict).
  const targeted = new Set<string>();

  for (const entry of variant.entries) {
    const map = working[entry.kind];
    if (entry.op === "add") {
      const key = entry.payload.componentKey;
      targeted.add(`${entry.kind}:${key}`);
      if (map.has(key)) {
        // base-new already has this key — convert add → replace
        reconciled.push({ op: "replace", kind: entry.kind, target: key, payload: entry.payload } as OverrideEntry);
      } else {
        reconciled.push(entry);
      }
      map.set(key, entry.payload as Component);
    } else if (entry.op === "replace") {
      targeted.add(`${entry.kind}:${entry.target}`);
      if (map.has(entry.target)) {
        // base-new has the key — keep as replace
        reconciled.push(entry);
      } else {
        // base-new dropped the key — convert replace → add (so materialize won't throw)
        reconciled.push(makeAddEntry(entry.kind, entry.payload as Component));
      }
      map.set(entry.target, entry.payload as Component);
    } else {
      // op === "remove"
      if (map.has(entry.target)) {
        // base-new still has it — keep the remove and mark as targeted for conflict detection
        targeted.add(`${entry.kind}:${entry.target}`);
        reconciled.push(entry);
        map.delete(entry.target);
      }
      // base-new already removed it → drop the entry (removing a missing key would throw);
      // both parties removed the key — silent agreement, not a conflict.
    }
  }

  const b1: Record<ComponentKind, Map<ComponentKey, Component>> = {
    step: indexFor(baseNew, "step"),
    slot: indexFor(baseNew, "slot"),
    usage: indexFor(baseNew, "usage"),
  };
  const changed = changedKeys(baseOld, baseNew);
  const conflicts: RebaseConflict[] = [];

  for (const id of targeted) {
    if (!changed.has(id)) continue;
    const i = id.indexOf(":");
    const kind = id.slice(0, i) as ComponentKind;
    const key = id.slice(i + 1);
    const baseNewVal = b1[kind].get(key) ?? null;
    conflicts.push({
      kind,
      componentKey: key,
      type: baseNewVal === null ? "base-removed" : "both-changed",
      baseNew: baseNewVal,
      variant: working[kind].get(key) ?? null,
    });
  }

  return { overrideSet: { ...variant, entries: reconciled }, conflicts };
}
