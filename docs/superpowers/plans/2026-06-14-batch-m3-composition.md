# Batch M3 — Composition / Sub-Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a recipe slot that resolves to *another recipe version* roll its macros up into the parent, flatten on read into one coherent card, be swappable by override, cycle-safe, and staleness-aware.

**Architecture:** A sub_recipe slot pins an immutable child version whose `macros` snapshot is already frozen; the parent **reads** that frozen total and scales it by a fraction of the child's yield (one shared ladder used by both the macro engine and the flattener, so the two views provably agree). Pure core functions (`subRecipeFraction`, `flattenContent`) gather their inputs from the service, which never recurses live. No storage change — a sub_recipe pin is a version ref already inside stored `content`.

**Tech Stack:** TypeScript (strict ESM), Vitest, pnpm workspace (`@batch/core` + `@batch/cli`). Tests live in `packages/{core,cli}/test/*.test.ts` and import source as `../src/X.js`. The spec is `docs/superpowers/specs/2026-06-14-batch-m3-composition-design.md`.

**Branch:** Work on `batch-core` (where M1+M2 already live). **All commits end with the trailer** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (omitted from the `-m` snippets below for brevity).

**Test commands** (no `cd`, run from repo root):
- One core file: `pnpm --filter @batch/core exec vitest run test/<file>.test.ts`
- All core: `pnpm --filter @batch/core test` — One CLI file: `pnpm --filter @batch/cli exec vitest run test/<file>.test.ts`
- Everything: `pnpm -r test` — Typecheck: `pnpm -r typecheck`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/core/src/units.ts` | gram-canonical conversions | **add** `convertWithin` (same-dimension), `massToGrams` (mass-only) |
| `packages/core/src/types.ts` | domain types | **add** `SubRecipeMacro`, `FlattenSource` |
| `packages/core/src/sub-recipe.ts` | the shared measurement ladder | **new** — `subRecipeFraction(usage, child)` |
| `packages/core/src/compute-macros.ts` | macro engine | **add** optional 4th param `subRecipes`; implement the sub_recipe rollup branch |
| `packages/core/src/flatten.ts` | expand a composed recipe on read | **new** — pure `flattenContent(content, subContents, scale, prefix)` |
| `packages/core/src/recipe-service.ts` | orchestration over the repo | **add** sub-recipe gather in `macrosFor`; `flatten`, `staleness`, `assertAcyclic` |
| `packages/core/src/index.ts` | public exports | **add** `convertWithin`, `massToGrams`, `subRecipeFraction`, `flattenContent` |
| `packages/cli/src/commands.ts` | CLI command fns | `show`/`resolve` flatten by default, `{ structure }` opt |
| `packages/cli/src/cli.ts` | commander wiring | `--structure` flag on `show`/`resolve` |
| `.claude/skills/batch/SKILL.md` | agent instructions | **add** composition section |

Dependency order of tasks: 1 → 2 → 3, 2 → 4, (3,4) → 5 → 6, then 7, 8.

---

## Task 1: Units helpers — `convertWithin` + `massToGrams`

**Files:**
- Modify: `packages/core/src/units.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/units.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `packages/core/test/units.test.ts`, and extend the import on line 2 to `import { toGrams, normalizeUnit, convertWithin, massToGrams } from "../src/units.js";`

```ts
describe("convertWithin", () => {
  it("returns the same value for identical units (incl. non-table units like batch)", () => {
    expect(convertWithin(2, "batch", "batch")).toBe(2);
    expect(convertWithin(18, "ladyfingers", "ladyfingers")).toBe(18);
  });
  it("converts within the mass dimension", () => {
    expect(convertWithin(1000, "g", "kg")).toBe(1);
    expect(convertWithin(1, "kg", "g")).toBe(1000);
  });
  it("converts within the volume dimension", () => {
    expect(convertWithin(1, "tbsp", "tsp")).toBeCloseTo(3, 5);
  });
  it("returns undefined across dimensions or for unknown units", () => {
    expect(convertWithin(1, "g", "batch")).toBeUndefined();
    expect(convertWithin(1, "cup", "g")).toBeUndefined();
  });
});

describe("massToGrams", () => {
  it("returns grams for a mass unit", () => {
    expect(massToGrams(2, "kg")).toBe(2000);
  });
  it("returns undefined for non-mass units (volume or count)", () => {
    expect(massToGrams(1, "cup")).toBeUndefined();
    expect(massToGrams(1, "batch")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm --filter @batch/core exec vitest run test/units.test.ts`
Expected: FAIL — `convertWithin is not a function` / `massToGrams is not a function`.

- [ ] **Step 3: Implement** — append to `packages/core/src/units.ts` (the private `MASS_TO_GRAM` / `VOLUME_TO_ML` tables are in scope):

```ts
/**
 * Convert within a single dimension only — mass↔mass or volume↔volume (D8). Identical
 * units pass through (so count/batch units like "batch" → "batch" return the value).
 * Returns `undefined` across dimensions or for unknown units; volume↔mass never lives here.
 */
export function convertWithin(value: number, fromUnit: string, toUnit: string): number | undefined {
  const f = normalizeUnit(fromUnit);
  const t = normalizeUnit(toUnit);
  if (f === t) return value;
  const fm = MASS_TO_GRAM[f], tm = MASS_TO_GRAM[t];
  if (fm !== undefined && tm !== undefined) return (value * fm) / tm;
  const fv = VOLUME_TO_ML[f], tv = VOLUME_TO_ML[t];
  if (fv !== undefined && tv !== undefined) return (value * fv) / tv;
  return undefined;
}

/** Grams iff `unit` is a universal mass unit; otherwise `undefined` (never touches density). */
export function massToGrams(value: number, unit: string): number | undefined {
  const m = MASS_TO_GRAM[normalizeUnit(unit)];
  return m === undefined ? undefined : value * m;
}
```

- [ ] **Step 4: Export from `index.ts`** — change line 8 to:

```ts
export { toGrams, normalizeUnit, convertWithin, massToGrams } from "./units.js";
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `pnpm --filter @batch/core exec vitest run test/units.test.ts`
Expected: PASS (all `convertWithin` + `massToGrams` cases green; pre-existing `toGrams`/`normalizeUnit` still green).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/units.ts packages/core/src/index.ts packages/core/test/units.test.ts
git commit -m "feat(core): same-dimension convertWithin + massToGrams helpers (M3)"
```

---

## Task 2: The shared measurement ladder — `SubRecipeMacro` + `subRecipeFraction`

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/sub-recipe.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/sub-recipe.test.ts`

- [ ] **Step 1: Add the carrier type** — in `packages/core/src/types.ts`, immediately after the `MacroSnapshot` interface (ends at line 118):

```ts
/**
 * A pinned child sub-recipe's frozen macro view (M3), built by the service from the
 * child version's snapshot and handed to `computeMacros` / `flattenContent`.
 */
export interface SubRecipeMacro {
  total: Macros;
  yield: Yield;
  totalGrams: number;
  basis: "complete" | "partial";
}

/** Provenance + staleness for one sub-recipe spliced into a flattened recipe (M3). */
export interface FlattenSource {
  versionId: VersionId;
  recipeName: string;
  behind: number;
}
```

- [ ] **Step 2: Write the failing test** — create `packages/core/test/sub-recipe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { subRecipeFraction } from "../src/sub-recipe.js";

const child = (amount: number, unit: string, totalGrams: number) => ({ yield: { amount, unit }, totalGrams });

describe("subRecipeFraction", () => {
  it("rung 1: whole batch when the usage unit matches the yield unit", () => {
    expect(subRecipeFraction({ quantityValue: 1, quantityUnit: "batch" }, child(1, "batch", 150)))
      .toEqual({ fraction: 1 });
  });
  it("rung 1: a literal count against a count yield", () => {
    const r = subRecipeFraction({ quantityValue: 18, quantityUnit: "ladyfingers" }, child(24, "ladyfingers", 480));
    expect("fraction" in r && Math.abs(r.fraction - 0.75) < 1e-9).toBe(true);
  });
  it("rung 1: grams against a gram yield (same dimension)", () => {
    const r = subRecipeFraction({ quantityValue: 20, quantityUnit: "g" }, child(150, "g", 150));
    expect("fraction" in r && Math.abs(r.fraction - 20 / 150) < 1e-9).toBe(true);
  });
  it("rung 2: grams against a batch yield fall back to the child's total weight", () => {
    const r = subRecipeFraction({ quantityValue: 30, quantityUnit: "g" }, child(1, "batch", 150));
    expect("fraction" in r && Math.abs(r.fraction - 30 / 150) < 1e-9).toBe(true);
  });
  it("rung 3: unresolved when the units can't be reconciled", () => {
    const r = subRecipeFraction({ quantityValue: 1, quantityUnit: "cup" }, child(1, "batch", 150));
    expect("reason" in r).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm --filter @batch/core exec vitest run test/sub-recipe.test.ts`
Expected: FAIL — cannot resolve `../src/sub-recipe.js` / `subRecipeFraction is not a function`.

- [ ] **Step 4: Implement** — create `packages/core/src/sub-recipe.ts`:

```ts
import { convertWithin, massToGrams } from "./units.js";
import type { StepUsage, Yield } from "./types.js";

export type FractionResult = { fraction: number } | { reason: string };

/**
 * What fraction of a sub-recipe's batch a usage consumes (M3, DM3-2). One ladder:
 *  1. usage unit reconciles with the child's yield unit (same unit, or same dimension via
 *     the universal table) → quantity ÷ yield.amount.
 *  2. usage is a mass unit but the yield isn't → grams ÷ the child's total batch weight.
 *  3. otherwise → unresolved (never throws).
 */
export function subRecipeFraction(
  usage: Pick<StepUsage, "quantityValue" | "quantityUnit">,
  child: { yield: Yield; totalGrams: number },
): FractionResult {
  const within = convertWithin(usage.quantityValue, usage.quantityUnit, child.yield.unit);
  if (within !== undefined && child.yield.amount > 0) {
    return { fraction: within / child.yield.amount };
  }
  const g = massToGrams(usage.quantityValue, usage.quantityUnit);
  if (g !== undefined && child.totalGrams > 0) {
    return { fraction: g / child.totalGrams };
  }
  return {
    reason: `can't measure a sub-recipe in "${usage.quantityUnit}" against yield unit "${child.yield.unit}" — use ${child.yield.unit} or grams`,
  };
}
```

- [ ] **Step 5: Export from `index.ts`** — add after the `computeMacros` export (line 7):

```ts
export { subRecipeFraction } from "./sub-recipe.js";
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm --filter @batch/core exec vitest run test/sub-recipe.test.ts`
Expected: PASS (all five rungs).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/sub-recipe.ts packages/core/src/index.ts packages/core/test/sub-recipe.test.ts
git commit -m "feat(core): SubRecipeMacro + the shared subRecipeFraction ladder (M3, DM3-2)"
```

---

## Task 3: Macro engine — sub_recipe rollup branch

**Files:**
- Modify: `packages/core/src/compute-macros.ts`
- Test: `packages/core/test/compute-macros.test.ts`

- [ ] **Step 1: Update the existing test + add rollup tests** — in `packages/core/test/compute-macros.test.ts`:

(a) extend the type import on line 3 to include `SubRecipeMacro`:
```ts
import type { LibraryIngredient, RecipeContent, SubRecipeMacro } from "../src/types.js";
```

(b) **replace** the existing test `"flags a sub-recipe slot as unresolved (deferred to M3)"` (lines 51–57) with this renamed version plus the new rollup tests:
```ts
  it("treats a sub-recipe slot as unresolved when its macros aren't provided", () => {
    const c = content();
    c.slots[0]!.resolution = { kind: "sub_recipe", subRecipeVersionId: "v-x" };
    const snap = computeMacros(c, { amount: 4, unit: "servings" }, lib(sugar, butter));
    expect(snap.basis).toBe("partial");
    expect(snap.lines.find((l) => l.slotKey === "sugar")?.status).toBe("unresolved");
  });

  it("rolls up a sub-recipe's macros scaled by the usage fraction", () => {
    const c: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "frost" }],
      slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: "v-frost" } }],
      usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" }],
    };
    const subs = new Map<string, SubRecipeMacro>([["v-frost", {
      total: { calories: 300, protein: 20, carbs: 10, fat: 18, fiber: 0 },
      yield: { amount: 1, unit: "batch" }, totalGrams: 150, basis: "complete",
    }]]);
    const snap = computeMacros(c, { amount: 5, unit: "cookies" }, new Map(), subs);
    expect(snap.basis).toBe("complete");
    expect(snap.total.calories).toBe(300);        // whole batch
    expect(snap.perServing.calories).toBe(60);    // ÷ 5
    expect(snap.lines.find((l) => l.slotKey === "frosting")?.grams).toBe(150);
  });

  it("scales a partial-batch usage and propagates a partial child", () => {
    const c: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "frost" }],
      slots: [{ componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: "v-frost" } }],
      usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "frosting", quantityValue: 0.5, quantityUnit: "batch" }],
    };
    const subs = new Map<string, SubRecipeMacro>([["v-frost", {
      total: { calories: 300, protein: 20, carbs: 10, fat: 18, fiber: 0 },
      yield: { amount: 1, unit: "batch" }, totalGrams: 150, basis: "partial",
    }]]);
    const snap = computeMacros(c, { amount: 5, unit: "cookies" }, new Map(), subs);
    expect(snap.total.calories).toBe(150);        // half a batch
    expect(snap.basis).toBe("partial");           // child was partial → parent partial
  });
```

- [ ] **Step 2: Run the tests, verify the new ones fail**

Run: `pnpm --filter @batch/core exec vitest run test/compute-macros.test.ts`
Expected: FAIL — the rollup tests fail (the sub_recipe slot is still flagged unresolved; `total.calories` is 0, not 300).

- [ ] **Step 3: Implement the branch** — in `packages/core/src/compute-macros.ts`:

(a) extend the type import (lines 1–3) to add `SubRecipeMacro`, and import the ladder:
```ts
import type {
  ComponentKey, IngredientSlot, LibraryIngredient, MacroLine, Macros, MacroSnapshot, RecipeContent, SubRecipeMacro, Yield,
} from "./types.js";
import { toGrams } from "./units.js";
import { subRecipeFraction } from "./sub-recipe.js";
```

(b) add the optional 4th parameter to the signature (currently lines 27–31):
```ts
export function computeMacros(
  content: RecipeContent,
  yieldSpec: Yield,
  ingredients: Map<string, LibraryIngredient>,
  subRecipes: Map<string, SubRecipeMacro> = new Map(),
): MacroSnapshot {
```

(c) **replace** the non-raw guard (currently lines 48–51):
```ts
    if (slot.resolution.kind !== "raw") {
      fail("sub-recipe macros not computed yet (M3)", { ingredientName: slot.name });
      continue;
    }
```
with the rollup branch:
```ts
    if (slot.resolution.kind === "sub_recipe") {
      const sub = subRecipes.get(slot.resolution.subRecipeVersionId);
      if (!sub) { fail(`sub-recipe ${slot.resolution.subRecipeVersionId} not loaded`, { ingredientName: slot.name }); continue; }
      const fr = subRecipeFraction(usage, sub);
      if ("reason" in fr) { fail(fr.reason, { ingredientName: slot.name }); continue; }
      const macros = mapMacros(sub.total, (n) => n * fr.fraction);
      total = zipMacros(total, macros, (x, y) => x + y);
      lines.push({
        slotKey: usage.slotKey, ingredientName: slot.name,
        grams: round2(fr.fraction * sub.totalGrams), macros: mapMacros(macros, round2), status: "ok",
      });
      if (sub.basis === "partial") unresolved.push(`${label}: sub-recipe macros are partial`);
      continue;
    }
```
(After this `continue`, TypeScript narrows `slot.resolution` to the `raw` variant, so the existing `const ingId = slot.resolution.libraryIngredientId;` line below compiles unchanged.)

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm --filter @batch/core exec vitest run test/compute-macros.test.ts`
Expected: PASS (rollup + partial-propagation green; the renamed unresolved-when-not-loaded test still green).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/compute-macros.ts packages/core/test/compute-macros.test.ts
git commit -m "feat(core): computeMacros rolls up sub-recipe slots via frozen snapshots (M3, UC18)"
```

---

## Task 4: Flatten — expand a composed recipe on read

**Files:**
- Create: `packages/core/src/flatten.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/flatten.test.ts`

- [ ] **Step 1: Write the failing test** — create `packages/core/test/flatten.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { flattenContent } from "../src/flatten.js";
import type { RecipeContent, Yield } from "../src/types.js";

function cookie(): RecipeContent {
  return {
    steps: [
      { componentKey: "mix", order: 1, instructionText: "Mix dough" },
      { componentKey: "frost", order: 2, instructionText: "Frost" },
    ],
    slots: [
      { componentKey: "flour", name: "flour", resolution: { kind: "raw", libraryIngredientId: "ing-flour" } },
      { componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: "v-frost" } },
    ],
    usages: [
      { componentKey: "u-flour", stepKey: "mix", slotKey: "flour", quantityValue: 100, quantityUnit: "g" },
      { componentKey: "u-frost", stepKey: "frost", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" },
    ],
  };
}
const frosting: RecipeContent = {
  steps: [{ componentKey: "beat", order: 1, instructionText: "Beat smooth" }],
  slots: [{ componentKey: "cc", name: "cream cheese", resolution: { kind: "raw", libraryIngredientId: "ing-cc" } }],
  usages: [{ componentKey: "u-cc", stepKey: "beat", slotKey: "cc", quantityValue: 150, quantityUnit: "g" }],
};
const subs = new Map([["v-frost", {
  content: frosting, yield: { amount: 1, unit: "batch" } as Yield, totalGrams: 150, name: "Cream Cheese Frosting",
}]]);

describe("flattenContent", () => {
  it("replaces the sub_recipe slot with the child's steps + ingredients, sectioned under its name", () => {
    const flat = flattenContent(cookie(), subs);
    expect(flat.slots.some((s) => s.resolution.kind === "sub_recipe")).toBe(false);
    expect(flat.slots.some((s) => s.componentKey === "frosting/cc")).toBe(true);
    expect(flat.steps.find((s) => s.componentKey === "frosting/beat")?.section).toBe("Cream Cheese Frosting");
    expect(flat.usages.find((u) => u.slotKey === "frosting/cc")?.quantityValue).toBe(150); // whole batch
    expect(flat.usages.find((u) => u.slotKey === "flour")?.quantityValue).toBe(100);        // parent untouched
  });

  it("scales the child's quantities by the usage fraction (half a batch)", () => {
    const half = cookie();
    half.usages[1]!.quantityValue = 0.5;
    const flat = flattenContent(half, subs);
    expect(flat.usages.find((u) => u.slotKey === "frosting/cc")?.quantityValue).toBe(75);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @batch/core exec vitest run test/flatten.test.ts`
Expected: FAIL — cannot resolve `../src/flatten.js` / `flattenContent is not a function`.

- [ ] **Step 3: Implement** — create `packages/core/src/flatten.ts`:

```ts
import type { IngredientSlot, RecipeContent, Step, StepUsage, Yield } from "./types.js";
import { subRecipeFraction } from "./sub-recipe.js";

export interface SubContent {
  content: RecipeContent;
  yield: Yield;
  totalGrams: number;
  name: string;
}

/**
 * Expand sub_recipe slots into the child's own steps + ingredients (M3, DM3-3). A derived
 * read — never stored. Child quantities are scaled by `scale × fraction` (same ladder the
 * macro engine uses, so the flattened card and the macro rollup agree by construction).
 * Component keys are prefixed per nesting level to avoid collisions; child steps are
 * sectioned under the child's name. When a usage's fraction can't be resolved, the whole
 * batch is shown (fraction 1) — the macro engine remains the source of truth for the number.
 */
export function flattenContent(
  content: RecipeContent,
  subContents: Map<string, SubContent>,
  scale = 1,
  prefix = "",
): RecipeContent {
  const slotByKey = new Map(content.slots.map((s) => [s.componentKey, s]));
  const steps: Step[] = [];
  const slots: IngredientSlot[] = [];
  const usages: StepUsage[] = [];

  for (const step of content.steps) {
    steps.push({ ...step, componentKey: prefix + step.componentKey });
  }
  for (const slot of content.slots) {
    if (slot.resolution.kind === "raw") slots.push({ ...slot, componentKey: prefix + slot.componentKey });
    // sub_recipe slots are replaced by the child's own slots, below
  }
  for (const usage of content.usages) {
    const slot = slotByKey.get(usage.slotKey);
    if (!slot) continue;
    if (slot.resolution.kind === "raw") {
      usages.push({
        ...usage,
        componentKey: prefix + usage.componentKey,
        stepKey: prefix + usage.stepKey,
        slotKey: prefix + usage.slotKey,
        quantityValue: usage.quantityValue * scale,
      });
      continue;
    }
    const child = subContents.get(slot.resolution.subRecipeVersionId);
    if (!child) continue;
    const fr = subRecipeFraction(usage, child);
    const childScale = scale * ("fraction" in fr ? fr.fraction : 1);
    const childPrefix = prefix + usage.slotKey + "/";
    const flat = flattenContent(child.content, subContents, childScale, childPrefix);
    for (const s of flat.steps) steps.push({ ...s, section: s.section ?? child.name });
    for (const s of flat.slots) slots.push(s);
    for (const u of flat.usages) usages.push(u);
  }
  return { steps, slots, usages };
}
```

- [ ] **Step 4: Export from `index.ts`** — add after the `subRecipeFraction` export:

```ts
export { flattenContent } from "./flatten.js";
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @batch/core exec vitest run test/flatten.test.ts`
Expected: PASS (splice + section + full-batch and half-batch scaling).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/flatten.ts packages/core/src/index.ts packages/core/test/flatten.test.ts
git commit -m "feat(core): flattenContent expands composed recipes on read (M3, DM3-3)"
```

---

## Task 5: Service integration — gather, flatten, staleness, cycle guard

**Files:**
- Modify: `packages/core/src/recipe-service.ts`
- Test: `packages/core/test/recipe-service.test.ts`

- [ ] **Step 1: Write the failing tests** — in `packages/core/test/recipe-service.test.ts`, add a new import near the top (after line 32; `RecipeContent` and `testDeps` are already imported):
```ts
import { computeMacros } from "../src/compute-macros.js";
```
Then append this describe block at the end of the file:
```ts
describe("composition (M3)", () => {
  const flour = { id: "ing-flour", name: "flour", macrosPer100g: { calories: 364, protein: 10, carbs: 76, fat: 1, fiber: 2.7 } };
  const cream = { id: "ing-cream", name: "cream cheese", macrosPer100g: { calories: 233, protein: 6, carbs: 8, fat: 19, fiber: 0 } };

  function frostingContent(): RecipeContent {
    return {
      steps: [{ componentKey: "beat", order: 1, instructionText: "Beat smooth" }],
      slots: [{ componentKey: "cc", name: "cream cheese", resolution: { kind: "raw", libraryIngredientId: "ing-cream" } }],
      usages: [{ componentKey: "u-cc", stepKey: "beat", slotKey: "cc", quantityValue: 100, quantityUnit: "g" }],
    };
  }
  function cookieContent(frostKey: string): RecipeContent {
    return {
      steps: [
        { componentKey: "mix", order: 1, instructionText: "Mix" },
        { componentKey: "frost", order: 2, instructionText: "Frost" },
      ],
      slots: [
        { componentKey: "flour", name: "flour", resolution: { kind: "raw", libraryIngredientId: "ing-flour" } },
        { componentKey: "frosting", name: "frosting", resolution: { kind: "sub_recipe", subRecipeVersionId: frostKey } },
      ],
      usages: [
        { componentKey: "u-flour", stepKey: "mix", slotKey: "flour", quantityValue: 100, quantityUnit: "g" },
        { componentKey: "u-frost", stepKey: "frost", slotKey: "frosting", quantityValue: 1, quantityUnit: "batch" },
      ],
    };
  }
  async function setup() {
    const svc = makeService();
    await svc.addIngredient(flour);
    await svc.addIngredient(cream);
    const { version: frost } = await svc.createRecipe({
      name: "Cream Cheese Frosting", yield: { amount: 1, unit: "batch" }, content: frostingContent(),
    });
    const { version: cookie } = await svc.createRecipe({
      name: "Cookie", yield: { amount: 5, unit: "cookies" }, content: cookieContent(frost.id),
    });
    return { svc, frost, cookie };
  }

  it("rolls a sub-recipe's macros up into the parent", async () => {
    const { cookie } = await setup();
    expect(cookie.macros?.basis).toBe("complete");
    expect(cookie.macros?.total.calories).toBe(597); // 100 g flour (364) + 1 batch frosting (233)
  });

  it("flattens the composed recipe so the frosting reads inline, with provenance", async () => {
    const { svc, cookie } = await setup();
    const { content, sources } = await svc.flatten(cookie.id);
    expect(content.slots.some((s) => s.resolution.kind === "sub_recipe")).toBe(false);
    expect(content.usages.find((u) => u.slotKey === "frosting/cc")?.quantityValue).toBe(100);
    expect(sources[0]?.recipeName).toBe("Cream Cheese Frosting");
    expect(sources[0]?.behind).toBe(0);
  });

  it("macros are invariant to flattening (rollup == flattened, within rounding)", async () => {
    const { svc, cookie } = await setup();
    const { content } = await svc.flatten(cookie.id);
    const flatSnap = computeMacros(content, cookie.yield, new Map([["ing-flour", flour], ["ing-cream", cream]]));
    expect(Math.abs(flatSnap.total.calories - cookie.macros!.total.calories)).toBeLessThanOrEqual(0.01);
  });

  it("counts staleness after the child advances, and rejects a composition cycle", async () => {
    const { svc, frost, cookie } = await setup();
    expect(await svc.staleness(frost.id)).toBe(0);
    await svc.editMetadata({ versionId: frost.id, patch: { name: "Cream Cheese Frosting v2" } });
    expect(await svc.staleness(frost.id)).toBe(1);
    await expect(svc.applyOverride({
      versionId: frost.id,
      entry: { op: "add", kind: "slot", payload: { componentKey: "loop", name: "loop", resolution: { kind: "sub_recipe", subRecipeVersionId: cookie.id } } },
    })).rejects.toThrow(/cycle/);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm --filter @batch/core exec vitest run test/recipe-service.test.ts`
Expected: FAIL — `cookie.macros.total.calories` is 364 not 597 (frosting unresolved); `svc.flatten` / `svc.staleness` are not functions.

- [ ] **Step 3: Implement** — in `packages/core/src/recipe-service.ts`:

(a) extend the type import (lines 1–4) to add `MacroLine`, `RecipeContent` is already imported, plus `SubRecipeMacro`, `FlattenSource`, `RecipeId`:
```ts
import type {
  Author, FlattenSource, LibraryIngredient, MacroLine, MacroSnapshot, OverrideEntry, OverrideSet,
  Recipe, RecipeContent, RecipeId, RecipeVersion, SubRecipeMacro, VersionId, VersionStatus, Yield,
} from "./types.js";
```
and add the flatten import after the computeMacros import (line 8):
```ts
import { flattenContent, type SubContent } from "./flatten.js";
```

(b) add a module-level helper above the class (after the imports):
```ts
function sumLineGrams(lines: MacroLine[]): number {
  return lines.reduce((g, l) => g + (l.grams ?? 0), 0);
}
```

(c) **replace** `macrosFor` (lines 14–25) so it also gathers sub-recipe snapshots:
```ts
  /** Load the library ingredients + pinned sub-recipe snapshots referenced by `content`, then compute. */
  private async macrosFor(content: RecipeContent, yieldSpec: Yield): Promise<MacroSnapshot> {
    const ids = new Set<string>();
    const subIds = new Set<string>();
    for (const slot of content.slots) {
      if (slot.resolution.kind === "raw") ids.add(slot.resolution.libraryIngredientId);
      else if (slot.resolution.kind === "sub_recipe") subIds.add(slot.resolution.subRecipeVersionId);
    }
    const ingredients = new Map<string, LibraryIngredient>();
    for (const id of ids) {
      const ing = await this.repo.getIngredient(id);
      if (ing) ingredients.set(id, ing);
    }
    const subRecipes = new Map<string, SubRecipeMacro>();
    for (const id of subIds) {
      const v = await this.repo.getVersion(id);
      if (v?.macros) {
        subRecipes.set(id, {
          total: v.macros.total, yield: v.macros.yield,
          totalGrams: sumLineGrams(v.macros.lines), basis: v.macros.basis,
        });
      }
    }
    return computeMacros(content, yieldSpec, ingredients, subRecipes);
  }
```

(d) in `applyOverride`, add the cycle guard immediately after `const current = await this.getVersion(input.versionId);` (currently line 116):
```ts
    if ((input.entry.op === "add" || input.entry.op === "replace") && input.entry.kind === "slot") {
      const res = input.entry.payload.resolution;
      if (res.kind === "sub_recipe") await this.assertAcyclic(current.recipeId, res.subRecipeVersionId);
    }
```

(e) add three methods to the class (place after `recomputeMacros`, before the closing brace):
```ts
  /** Expand a composed recipe into one flat card (DM3-3) — derived, never stored. */
  async flatten(versionId: VersionId): Promise<{ content: RecipeContent; sources: FlattenSource[] }> {
    const v = await this.getVersion(versionId);
    const subContents = new Map<string, SubContent>();
    const sources: FlattenSource[] = [];
    await this.gatherSubContents(v.content, subContents, sources);
    return { content: flattenContent(v.content, subContents), sources };
  }

  private async gatherSubContents(
    content: RecipeContent, subContents: Map<string, SubContent>, sources: FlattenSource[],
  ): Promise<void> {
    for (const slot of content.slots) {
      if (slot.resolution.kind !== "sub_recipe") continue;
      const id = slot.resolution.subRecipeVersionId;
      if (subContents.has(id)) continue;
      const child = await this.repo.getVersion(id);
      if (!child) continue;
      const totalGrams = child.macros ? sumLineGrams(child.macros.lines) : 0;
      subContents.set(id, { content: child.content, yield: child.yield, totalGrams, name: child.name });
      sources.push({ versionId: id, recipeName: child.name, behind: await this.staleness(id) });
      await this.gatherSubContents(child.content, subContents, sources);
    }
  }

  /** How many versions the pinned recipe's head is ahead of this pin (UC12; 0 = current). */
  async staleness(pinVersionId: VersionId): Promise<number> {
    const pin = await this.repo.getVersion(pinVersionId);
    if (!pin) return 0;
    const recipe = await this.repo.getRecipe(pin.recipeId);
    if (!recipe) return 0;
    let cursor: VersionId | undefined = recipe.headVersionId;
    let n = 0;
    while (cursor) {
      if (cursor === pinVersionId) return n;
      const v: RecipeVersion | undefined = await this.repo.getVersion(cursor);
      if (!v) break;
      cursor = v.prevVersionId;
      n++;
    }
    return n;
  }

  /** Reject composing `targetSubVersionId` if its sub-recipe closure reaches `thisRecipeId` (UC15). */
  private async assertAcyclic(thisRecipeId: RecipeId, targetSubVersionId: VersionId): Promise<void> {
    const seen = new Set<VersionId>();
    const stack: VersionId[] = [targetSubVersionId];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const v = await this.repo.getVersion(id);
      if (!v) continue;
      if (v.recipeId === thisRecipeId) {
        throw new Error(`composition cycle: sub-recipe ${targetSubVersionId} already depends on recipe ${thisRecipeId}`);
      }
      for (const slot of v.content.slots) {
        if (slot.resolution.kind === "sub_recipe") stack.push(slot.resolution.subRecipeVersionId);
      }
    }
  }
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm --filter @batch/core exec vitest run test/recipe-service.test.ts`
Expected: PASS (rollup 597, flatten inline + provenance, invariance ≤0.01, staleness 0→1, cycle rejected).

- [ ] **Step 5: Run the whole core suite (catch regressions)**

Run: `pnpm --filter @batch/core test`
Expected: PASS — all core tests green (the M2 macro tests are unaffected because `subRecipes` defaults to empty).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): service gathers sub-recipe snapshots; flatten + staleness + cycle guard (M3)"
```

---

## Task 6: CLI — flatten by default, `--structure` for the pins

**Files:**
- Modify: `packages/cli/src/commands.ts`
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/test/commands.test.ts`

- [ ] **Step 1: Write the failing test** — append to `packages/cli/test/commands.test.ts` (inside the existing `describe("commands", ...)` block, before its closing `});`):

```ts
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
  });
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @batch/cli exec vitest run test/commands.test.ts`
Expected: FAIL — `flat.content` still has a sub_recipe slot / `flat.sources` is undefined (show doesn't flatten yet).

- [ ] **Step 3: Implement** — in `packages/cli/src/commands.ts`:

(a) extend the type import (lines 2–5) to add `FlattenSource`:
```ts
import type {
  Author, FlattenSource, LibraryIngredient, Macros, MacroSnapshot, OverrideEntry, Recipe, RecipeContent,
  RecipeService, RecipeVersion, VersionStatus, Yield,
} from "@batch/core";
```

(b) **replace** `show` (lines 36–38) and `resolve` (lines 40–42):
```ts
export interface ViewOpts { structure?: boolean }

export async function show(
  svc: RecipeService, versionId: string, opts: ViewOpts = {},
): Promise<RecipeVersion & { sources?: FlattenSource[] }> {
  const version = await svc.getVersion(versionId);
  if (opts.structure) return version; // stored composed content, sub_recipe pins intact
  const { content, sources } = await svc.flatten(versionId);
  return { ...version, content, sources };
}

export async function resolve(
  svc: RecipeService, versionId: string, opts: ViewOpts = {},
): Promise<RecipeContent> {
  if (opts.structure) return svc.resolve(versionId);
  return (await svc.flatten(versionId)).content;
}
```

- [ ] **Step 4: Wire `--structure` into `cli.ts`** — replace the `show` command (lines 83–85) and the `resolve` command (lines 87–89):
```ts
  program.command("show <versionId>")
    .description("show a version with its recipe content (flattened by default; --structure keeps sub-recipe pins)")
    .option("--structure", "show the stored composed content (sub-recipe pins + staleness) instead of the flattened card")
    .action(async (versionId, opts) => out(await cmd.show(makeService(), versionId, { structure: opts.structure })));

  program.command("resolve <versionId>")
    .description("print only the resolved RecipeContent (flattened by default; --structure keeps sub-recipe pins)")
    .option("--structure", "print the stored composed content instead of the flattened card")
    .action(async (versionId, opts) => out(await cmd.resolve(makeService(), versionId, { structure: opts.structure })));
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @batch/cli exec vitest run test/commands.test.ts`
Expected: PASS (default flattens + carries sources; `--structure` keeps the pin and omits sources). The pre-existing `show` tests (raw recipes) stay green because flattening a raw-only recipe is identity.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/src/cli.ts packages/cli/test/commands.test.ts
git commit -m "feat(cli): show/resolve flatten composed recipes by default; --structure for pins (M3)"
```

---

## Task 7: Skill docs — composition section

**Files:**
- Modify: `.claude/skills/batch/SKILL.md`

- [ ] **Step 1: Read the current skill to find the right insertion point**

Run: `grep -n "Macros\|ingredient\|## " .claude/skills/batch/SKILL.md`
Expected: prints the section headers; pick the spot **after** the Macros / ingredient-library section.

- [ ] **Step 2: Insert the composition section** — add this block after the Macros section:

```markdown
## Composition — sub-recipes (M3)

A slot can resolve to **another recipe version** instead of a raw ingredient — a shared frosting, glaze, or crust. Its macros roll up into the parent and it reads inline.

- **Author it** in `content.slots`: `{ "componentKey": "frosting", "name": "frosting", "resolution": { "kind": "sub_recipe", "subRecipeVersionId": "<child version id>" } }`, plus a usage that says how much: `{ ..., "slotKey": "frosting", "quantityValue": 1, "quantityUnit": "batch" }`.
- **How much** is a fraction of the child's *yield*: `1 batch` of a `yield 1 batch` frosting = the whole thing; `0.5 batch` = half; `18 ladyfingers` of a `yield 24 ladyfingers` recipe = 18/24. Grams always work too (`20 g`), even against a `batch` yield. Units that can't reconcile show up as unresolved — give the child a yield unit you'll measure it in.
- **Read it**: `./batch show <id>` and `./batch resolve <id>` **flatten** by default — the child's steps and ingredients are spliced in (scaled), sectioned under the child's name, with a `sources[]` list noting each child and how many versions behind it is. Add `--structure` to see the raw pins instead.
- **Swap it** (test a different frosting): one override — `{ "op": "replace", "kind": "slot", "target": "frosting", "payload": { ...same slot, "resolution": { "kind": "sub_recipe", "subRecipeVersionId": "<other frosting version>" } } }`. Keep a family of interchangeable sub-recipes on the **same yield unit** so the `1 batch` usage still resolves.
- **Compose-and-verify loop**: build the shared sub-recipe as its own root → `override` the parent to remove its inline copy and add the sub_recipe slot+usage → `./batch macros <parent>` to confirm the total is preserved. A sub_recipe pin can go "N behind" its child's head; re-pointing/rebasing onto a newer child is M4 (not yet built).
```

- [ ] **Step 3: Verify it reads correctly and references only real commands**

Run: `grep -n "structure\|sub_recipe\|subRecipeVersionId" .claude/skills/batch/SKILL.md`
Expected: the new block is present; every command it mentions (`show`, `resolve`, `--structure`, `macros`, `override`) exists in `cli.ts`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/batch/SKILL.md
git commit -m "docs(skill): teach the batch skill composition / sub-recipes (M3)"
```

---

## Task 8: Full verification + final review

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm -r test`
Expected: PASS — all packages green. Core gained ~11 tests (units +2, sub-recipe +5 cases in 1 file, compute-macros +2 net, flatten +2, recipe-service +4); CLI gained +1. No prior test regressed.

- [ ] **Step 2: Typecheck both packages**

Run: `pnpm -r typecheck`
Expected: PASS — no `tsc` errors (the optional 4th param keeps M2 call sites valid; the sub_recipe branch narrows `slot.resolution` to `raw` afterward).

- [ ] **Step 3: Smoke-test against a scratch store** (proves the real `./batch` binary composes end-to-end)

```bash
export BATCH_DB=/tmp/batch-m3-smoke/db.json
rm -rf /tmp/batch-m3-smoke
echo '{"id":"ing-cc","name":"cc","macrosPer100g":{"calories":233,"protein":6,"carbs":8,"fat":19,"fiber":0}}' | ./batch ingredient add
echo '{"id":"ing-flour","name":"flour","macrosPer100g":{"calories":364,"protein":10,"carbs":76,"fat":1,"fiber":2.7}}' | ./batch ingredient add
FROST=$(echo '{"name":"Frosting","yield":{"amount":1,"unit":"batch"},"content":{"steps":[{"componentKey":"beat","order":1,"instructionText":"Beat"}],"slots":[{"componentKey":"cc","name":"cc","resolution":{"kind":"raw","libraryIngredientId":"ing-cc"}}],"usages":[{"componentKey":"ucc","stepKey":"beat","slotKey":"cc","quantityValue":100,"quantityUnit":"g"}]}}' | ./batch create | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).version.id))')
echo "{\"name\":\"Cookie\",\"yield\":{\"amount\":5,\"unit\":\"cookies\"},\"content\":{\"steps\":[{\"componentKey\":\"mix\",\"order\":1,\"instructionText\":\"Mix\"},{\"componentKey\":\"frost\",\"order\":2,\"instructionText\":\"Frost\"}],\"slots\":[{\"componentKey\":\"flour\",\"name\":\"flour\",\"resolution\":{\"kind\":\"raw\",\"libraryIngredientId\":\"ing-flour\"}},{\"componentKey\":\"frosting\",\"name\":\"frosting\",\"resolution\":{\"kind\":\"sub_recipe\",\"subRecipeVersionId\":\"$FROST\"}}],\"usages\":[{\"componentKey\":\"uflour\",\"stepKey\":\"mix\",\"slotKey\":\"flour\",\"quantityValue\":100,\"quantityUnit\":\"g\"},{\"componentKey\":\"ufrost\",\"stepKey\":\"frost\",\"slotKey\":\"frosting\",\"quantityValue\":1,\"quantityUnit\":\"batch\"}]}}" | ./batch create | node -e 'process.stdin.on("data",d=>{const v=JSON.parse(d).version;console.log("cookie kcal total:",v.macros.total.calories,"basis:",v.macros.basis)})'
rm -rf /tmp/batch-m3-smoke; unset BATCH_DB
```
Expected: `cookie kcal total: 597 basis: complete`.

- [ ] **Step 4: Final code review** — per superpowers:subagent-driven-development, dispatch the final code-reviewer subagent over the whole M3 diff (`git diff 148c7aa..HEAD`), checking spec coverage (DM3-1…6), the macro-invariance property, and that no storage/M2 behavior changed.

---

## Post-merge dogfood (interactive — NOT a subagent task)

Do this **with the user**, against `~/.batch` (back it up / it's already a git repo). It's the "see how it affects our recipes" payoff, and it touches real personal data, so it stays human-in-the-loop rather than dispatched:

1. Create `Protein Cream Cheese Frosting` as a **root** from Red Velvet's inline frosting usages, `yield 1 batch`.
2. Convert Red Velvet via overrides: `remove` the 5 inline frosting slots + their usages; `add` one `sub_recipe` slot (→ the frosting version) + one usage (`1 batch`) on the frost step.
3. `./batch macros <red-velvet>` — confirm the total matches the pre-conversion number to within ≤0.01/serving.
4. `derive` a **Cool-Whip** frosting variant (`yield 1 batch`); show a cookie composing it via a one-line `replace slot`.
5. Edit the frosting (new version) and confirm the cookie reads `1 behind`.
6. Commit the updated `~/.batch` store + refresh `sources/`.

---

## Self-review notes (author check, complete)

- **Spec coverage:** DM3-1 frozen recursion → Task 3/5; DM3-2 ladder → Task 1+2; DM3-3 flatten-on-read + invariance → Task 4 + the Task 5 invariance test; DM3-4 swap-via-override + no compose command → Task 6 (override path unchanged) + Task 7 docs; DM3-5 cycle guard → Task 5; DM3-6 staleness count → Task 5; CLI display → Task 6; skill → Task 7. UC18/UC12/UC15 all mapped.
- **Type consistency:** `SubRecipeMacro { total, yield, totalGrams, basis }` and `FlattenSource { versionId, recipeName, behind }` defined in Task 2, consumed identically in Tasks 3/5/6; `subRecipeFraction(usage, { yield, totalGrams })` signature stable across Tasks 2/3/4; `SubContent` defined in `flatten.ts` (Task 4) and imported in Task 5.
- **No placeholders:** every code step shows full code; every run step gives an exact command + expected output.
