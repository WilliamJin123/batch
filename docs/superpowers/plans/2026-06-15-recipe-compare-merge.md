# Recipe Compare & Merge (M4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `compare` (align N recipes side by side), `promote` (bake a winning choice into a base), `rebase` (3-way-merge a variant onto an improved base), and multi-parent provenance — the quality-driven tuning layer (M4) over Batch `core`.

**Architecture:** Two pure modules carry the heavy logic — `compare.ts` (ingredient matrix joined by library-ingredient-id over flattened content) and `rebase.ts` (base-diff + variant-wins conflict reconciliation) — each wrapped by thin `RecipeService` methods and CLI commands. `promote` is sugar over the existing `applyOverride`. Provenance is two optional fields on `RecipeVersion`. No repository-method changes; everything is additive (old stores load unchanged).

**Tech Stack:** TypeScript strict ESM, pnpm monorepo (`@batch/core` + `@batch/cli`), Vitest, commander. ESM imports use `.js` extensions. `exactOptionalPropertyTypes` is OFF. Run from repo root `/Users/williamjin/Documents/batch`.

**Spec:** `docs/superpowers/specs/2026-06-15-recipe-compare-merge-design.md` (decisions CM-1…CM-8).

---

## Conventions for every task

- **Test runner:** `pnpm --filter @batch/core test` (all core) / `pnpm --filter @batch/cli test` (all cli). Single file: `pnpm --filter @batch/core exec vitest run test/<file>` .
- **Typecheck:** `pnpm --filter @batch/core typecheck` / `pnpm --filter @batch/cli typecheck`.
- **Test helpers already exist:** `testDeps()` yields ids `id1, id2, …` and a fixed clock `2026-01-01T00:00:00.000Z`. Prefer asserting on returned objects over hard-coding ids.
- **Commit** after each task's tests pass (conventional commits, `feat(core):` / `feat(cli):` / `docs(skill):`).

---

## File Structure

**core (new):**
- `src/compare.ts` — pure `buildCompareView(inputs, ingredients)` + `CompareView`/`CompareColumn`/`CompareIngredientRow`/`CompareStepList`/`CompareInput`.
- `src/rebase.ts` — pure `buildRebasePlan(baseOld, baseNew, variantOverrideSet)` + `RebasePlan`/`RebaseConflict`.

**core (modified):**
- `src/types.ts` — `parentVersionIds?` / `provenanceNote?` on `RecipeVersion`.
- `src/recipe-service.ts` — `createRecipe` provenance; new `compare`, `rebase`, `rebaseVariants`, `promote` (+ `RebaseResult` type).
- `src/index.ts` — export the new builders + types.

**cli (modified):**
- `src/commands.ts` — `compare`, `promote`, `rebase`, `rebaseAll` wrappers; `CreateInput` provenance; `TreeNode.parentVersionIds`.
- `src/cli.ts` — `compare` / `promote` / `rebase` verbs; `create --parents/--rationale`.

**skill (modified):**
- `.claude/skills/batch/SKILL.md` — an "M4: compare, promote, rebase" section.

---

## Task 1: Provenance fields + `createRecipe` (core)

**Files:**
- Modify: `packages/core/src/types.ts:138-154` (RecipeVersion)
- Modify: `packages/core/src/recipe-service.ts:56-91` (createRecipe)
- Test: `packages/core/test/recipe-service.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/recipe-service.test.ts`:

```ts
describe("createRecipe provenance (CM-7)", () => {
  it("records parentVersionIds + provenanceNote when given", async () => {
    const s = makeService();
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const b = await s.createRecipe({ name: "B", yield: { amount: 1, unit: "x" }, content: content() });
    const champ = await s.createRecipe({
      name: "Champion", yield: { amount: 1, unit: "x" }, content: content(),
      parents: [a.version.id, b.version.id], rationale: "cornstarch from A, zest from B",
    });
    expect(champ.version.parentVersionIds).toEqual([a.version.id, b.version.id]);
    expect(champ.version.provenanceNote).toBe("cornstarch from A, zest from B");
  });
  it("omits the fields entirely when not given (old-store shape preserved)", async () => {
    const s = makeService();
    const r = await s.createRecipe({ name: "Plain", yield: { amount: 1, unit: "x" }, content: content() });
    expect("parentVersionIds" in r.version).toBe(false);
    expect("provenanceNote" in r.version).toBe(false);
  });
  it("rejects an unknown parent version", async () => {
    const s = makeService();
    await expect(s.createRecipe({
      name: "X", yield: { amount: 1, unit: "x" }, content: content(), parents: ["nope"],
    })).rejects.toThrow("version not found: nope");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/core exec vitest run test/recipe-service.test.ts`
Expected: FAIL (`parents` not accepted; `parentVersionIds` undefined).

- [ ] **Step 3: Add the fields to `RecipeVersion`**

In `packages/core/src/types.ts`, inside `RecipeVersion` (after `macros?` line 152), add:

```ts
  macros?: MacroSnapshot; // computed nutrition snapshot (UC19); set at commit
  parentVersionIds?: VersionId[]; // amalgam provenance (CM-7) — pure metadata, no materialization
  provenanceNote?: string; // rationale for a synthesized champion
  createdAt: string; // ISO-8601
```

- [ ] **Step 4: Plumb provenance through `createRecipe`**

In `packages/core/src/recipe-service.ts`, change the `createRecipe` input signature and body. Replace the input type (lines 56-64) to add two optional fields:

```ts
  async createRecipe(input: {
    name: string;
    description?: string;
    tags?: string[];
    yield: Yield;
    content: RecipeContent;
    author?: Author;
    commitMessage?: string;
    parents?: VersionId[];   // CM-7
    rationale?: string;      // CM-7
  }): Promise<{ recipe: Recipe; version: RecipeVersion }> {
```

Then, just before building `version` (after line 71 `const macros = …`), validate parents and build the provenance patch:

```ts
    const content = structuredClone(input.content);
    const macros = await this.macrosFor(content, input.yield);
    if (input.parents) for (const pid of input.parents) await this.getVersion(pid); // validate existence (throws)
    const version: RecipeVersion = {
      id: versionId,
      recipeId,
      name: input.name,
      description: input.description,
      tags: input.tags ?? [],
      yield: input.yield,
      status: "draft",
      author,
      commitMessage: input.commitMessage ?? "create recipe",
      content,
      macros,
      ...(input.parents && input.parents.length ? { parentVersionIds: input.parents } : {}),
      ...(input.rationale ? { provenanceNote: input.rationale } : {}),
      createdAt: now,
    };
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @batch/core test` then `pnpm --filter @batch/core typecheck`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): multi-parent provenance on createRecipe (CM-7)"
```

---

## Task 2: Provenance passthrough + `tree` edge (cli)

**Files:**
- Modify: `packages/cli/src/commands.ts:8-14` (CreateInput/create), `:129-139` (TreeNode/tree)
- Modify: `packages/cli/src/cli.ts:41-44` (create command)
- Test: `packages/cli/test/commands.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/test/commands.test.ts` (inside the `describe("commands", …)` block, before its closing `});`):

```ts
  it("create records provenance and tree surfaces parent edges (CM-7)", async () => {
    const s = svc();
    const a = await cmd.create(s, { name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const b = await cmd.create(s, { name: "B", yield: { amount: 1, unit: "x" }, content: content() });
    const champ = await cmd.create(s, {
      name: "Champion", yield: { amount: 1, unit: "x" }, content: content(),
      parents: [a.version.id, b.version.id], rationale: "blend",
    });
    expect(champ.version.parentVersionIds).toEqual([a.version.id, b.version.id]);
    const node = (await cmd.tree(s)).find((n) => n.versionId === champ.version.id);
    expect(node?.parentVersionIds).toEqual([a.version.id, b.version.id]);
  });
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/cli exec vitest run test/commands.test.ts`
Expected: FAIL (`parents` not on `CreateInput`; `parentVersionIds` not on tree node).

- [ ] **Step 3: Extend `CreateInput` and `TreeNode`**

In `packages/cli/src/commands.ts`, change `CreateInput` (lines 8-11):

```ts
export interface CreateInput {
  name: string; description?: string; tags?: string[];
  yield: Yield; content: RecipeContent; author?: Author; commitMessage?: string;
  parents?: string[]; rationale?: string; // CM-7
}
```

`create` already forwards the whole input to `svc.createRecipe`, so no change to `create()` itself.

Change `TreeNode` (lines 129-132) and `tree` (lines 133-139):

```ts
export interface TreeNode {
  versionId: string; recipeId: string; name: string;
  derivesFromVersionId?: string; prevVersionId?: string; parentVersionIds?: string[];
}
export async function tree(svc: RecipeService): Promise<TreeNode[]> {
  const versions = await svc.listVersions();
  return versions.map((v) => ({
    versionId: v.id, recipeId: v.recipeId, name: v.name,
    derivesFromVersionId: v.derivesFromVersionId, prevVersionId: v.prevVersionId,
    ...(v.parentVersionIds ? { parentVersionIds: v.parentVersionIds } : {}),
  }));
}
```

- [ ] **Step 4: Add `--parents` / `--rationale` to the `create` CLI command**

In `packages/cli/src/cli.ts`, replace the `create` command (lines 41-44):

```ts
  program.command("create")
    .description("create a recipe from JSON ({name,yield,content,...}) on stdin or --file")
    .option("-f, --file <path>", "read input JSON from a file instead of stdin")
    .option("--parents <csv>", "comma-separated source version ids this recipe was amalgamated from (CM-7)")
    .option("--rationale <text>", "why these sources were blended into this champion")
    .action(async (opts) => {
      const input = await readJson(opts.file);
      if (opts.parents) input.parents = String(opts.parents).split(",").map((p: string) => p.trim()).filter(Boolean);
      if (opts.rationale) input.rationale = opts.rationale;
      out(await cmd.create(makeService(), input));
    });
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @batch/cli test` then `pnpm --filter @batch/cli typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/src/cli.ts packages/cli/test/commands.test.ts
git commit -m "feat(cli): create --parents/--rationale; tree shows parent edges (CM-7)"
```

---

## Task 3: `compare.ts` pure builder (core)

**Files:**
- Create: `packages/core/src/compare.ts`
- Modify: `packages/core/src/index.ts:13` (exports)
- Test: `packages/core/test/compare.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/compare.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCompareView, type CompareInput } from "../src/compare.js";
import type { LibraryIngredient, RecipeContent } from "../src/types.js";

const ing = (id: string, name: string, extra: Partial<LibraryIngredient> = {}): LibraryIngredient => ({
  id, name, macrosPer100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, ...extra,
});

function input(p: Partial<CompareInput> & Pick<CompareInput, "versionId" | "content">): CompareInput {
  return {
    recipeId: "r-" + p.versionId, name: p.versionId, isVariant: false,
    yield: { amount: 1, unit: "x" }, perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    macroBasis: "complete", feedback: [], ...p,
  } as CompareInput;
}

const flour = (key: string, slotKey: string, ingId: string, g: number, unit = "g"): RecipeContent => ({
  steps: [{ componentKey: "s1", order: 1, instructionText: "do it" }],
  slots: [{ componentKey: slotKey, name: ingId, resolution: { kind: "raw", libraryIngredientId: ingId } }],
  usages: [{ componentKey: key, stepKey: "s1", slotKey, quantityValue: g, quantityUnit: unit }],
});

describe("buildCompareView", () => {
  it("joins ingredient rows by libraryIngredientId across separate recipes (CM-1)", () => {
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-flour", 100) }),
       input({ versionId: "vB", content: flour("uB", "slB", "ing-flour", 50) })],
      new Map([["ing-flour", ing("ing-flour", "Flour")]]),
    );
    const row = view.ingredients.find((r) => r.ingredientId === "ing-flour")!;
    expect(row.perServingGrams).toEqual({ vA: 100, vB: 50 }); // yield.amount = 1
  });

  it("absent ingredient is null, not zero (CM-2)", () => {
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-cornstarch", 12) }),
       input({ versionId: "vB", content: flour("uB", "slB", "ing-flour", 50) })],
      new Map([["ing-cornstarch", ing("ing-cornstarch", "Cornstarch")], ["ing-flour", ing("ing-flour", "Flour")]]),
    );
    const corn = view.ingredients.find((r) => r.ingredientId === "ing-cornstarch")!;
    expect(corn.perServingGrams.vA).toBe(12);
    expect(corn.perServingGrams.vB).toBeNull();
  });

  it("present-but-unconvertible is \"present\", not null (CM-2)", () => {
    // a volume unit with no density cannot convert to grams
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-vanilla", 1, "tsp") })],
      new Map([["ing-vanilla", ing("ing-vanilla", "Vanilla")]]), // no densityGPerMl
    );
    expect(view.ingredients[0]?.perServingGrams.vA).toBe("present");
  });

  it("sums multiple usages of the same ingredient, divides by yield amount", () => {
    const content: RecipeContent = {
      steps: [{ componentKey: "s1", order: 1, instructionText: "x" }],
      slots: [{ componentKey: "sl", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
      usages: [
        { componentKey: "u1", stepKey: "s1", slotKey: "sl", quantityValue: 100, quantityUnit: "g" },
        { componentKey: "u2", stepKey: "s1", slotKey: "sl", quantityValue: 100, quantityUnit: "g" },
      ],
    };
    const view = buildCompareView(
      [input({ versionId: "v", content, yield: { amount: 4, unit: "x" } })],
      new Map([["ing-sugar", ing("ing-sugar", "Sugar")]]),
    );
    expect(view.ingredients[0]?.perServingGrams.v).toBe(50); // (100+100)/4
  });

  it("columns carry dish + component verdicts, steps are per-version", () => {
    const fb = [
      { kind: "made" as const, id: "f1", recipeId: "r-vA", versionId: "vA", rating: "excellent" as const,
        date: "2026-06-02", author: "user" as const, createdAt: "2026-06-02T00:00:00.000Z" },
      { kind: "made" as const, id: "f2", recipeId: "r-vA", versionId: "vA", rating: "bad" as const, componentKey: "sl-glaze",
        date: "2026-06-02", author: "user" as const, createdAt: "2026-06-02T00:00:00.000Z" },
    ];
    const view = buildCompareView(
      [input({ versionId: "vA", content: flour("uA", "slA", "ing-flour", 10), feedback: fb })],
      new Map([["ing-flour", ing("ing-flour", "Flour")]]),
    );
    expect(view.columns[0]?.verdict).toBe("excellent");
    expect(view.columns[0]?.componentVerdicts["sl-glaze"]).toBe("bad");
    expect(view.steps[0]?.steps[0]?.text).toBe("do it");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/core exec vitest run test/compare.test.ts`
Expected: FAIL (`../src/compare.js` does not exist).

- [ ] **Step 3: Implement `compare.ts`**

Create `packages/core/src/compare.ts`:

```ts
import type {
  ComponentKey, FeedbackEntry, LibraryIngredient, Macros, Rating, RecipeContent, RecipeId, VersionId, Yield,
} from "./types.js";
import { toGrams } from "./units.js";
import { summarizeRecipe, currentVerdicts } from "./feedback.js";

/** One version's inputs to the compare matrix. `content` is the FLATTENED content (raw slots only). */
export interface CompareInput {
  versionId: VersionId; recipeId: RecipeId; name: string; isVariant: boolean;
  yield: Yield; perServing: Macros; macroBasis: "complete" | "partial";
  content: RecipeContent;
  feedback: FeedbackEntry[];
}
export interface CompareColumn {
  versionId: VersionId; recipeId: RecipeId; name: string; isVariant: boolean;
  perServing: Macros; macroBasis: "complete" | "partial";
  verdict?: Rating; componentVerdicts: Record<ComponentKey, Rating>;
}
export interface CompareIngredientRow {
  ingredientId: string; name: string;
  /** grams per serving | "present" (used but unconvertible) | null (absent) — CM-2 */
  perServingGrams: Record<VersionId, number | "present" | null>;
}
export interface CompareStepList {
  versionId: VersionId; steps: Array<{ order: number; section?: string; text: string }>;
}
export interface CompareView {
  columns: CompareColumn[]; ingredients: CompareIngredientRow[]; steps: CompareStepList[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Build the compare view-model: ingredient matrix joined by library-ingredient-id, macros + verdicts per column. */
export function buildCompareView(
  inputs: CompareInput[], ingredients: Map<string, LibraryIngredient>,
): CompareView {
  const perVersion = new Map<VersionId, Map<string, { grams: number; quantified: boolean }>>();
  const allIngIds = new Set<string>();
  for (const inp of inputs) {
    const slotByKey = new Map(inp.content.slots.map((s) => [s.componentKey, s]));
    const acc = new Map<string, { grams: number; quantified: boolean }>();
    for (const u of inp.content.usages) {
      const slot = slotByKey.get(u.slotKey);
      if (!slot || slot.resolution.kind !== "raw") continue;
      const ingId = slot.resolution.libraryIngredientId;
      allIngIds.add(ingId);
      const rec = acc.get(ingId) ?? { grams: 0, quantified: false };
      const ing = ingredients.get(ingId);
      if (ing) {
        const g = toGrams(u.quantityValue, u.quantityUnit, ing);
        if ("grams" in g) { rec.grams += g.grams; rec.quantified = true; }
      }
      acc.set(ingId, rec);
    }
    perVersion.set(inp.versionId, acc);
  }

  const rows: CompareIngredientRow[] = [...allIngIds].map((ingId) => {
    const perServingGrams: Record<VersionId, number | "present" | null> = {};
    for (const inp of inputs) {
      const rec = perVersion.get(inp.versionId)!.get(ingId);
      if (!rec) { perServingGrams[inp.versionId] = null; continue; }
      perServingGrams[inp.versionId] =
        rec.quantified && inp.yield.amount > 0 ? round2(rec.grams / inp.yield.amount) : "present";
    }
    return { ingredientId: ingId, name: ingredients.get(ingId)?.name ?? ingId, perServingGrams };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const columns: CompareColumn[] = inputs.map((inp) => {
    const summary = summarizeRecipe(inp.feedback);
    const cv = currentVerdicts(inp.feedback);
    const componentVerdicts: Record<ComponentKey, Rating> = {};
    for (const [key, entry] of Object.entries(cv.components)) {
      if (entry.rating) componentVerdicts[key] = entry.rating;
    }
    return {
      versionId: inp.versionId, recipeId: inp.recipeId, name: inp.name, isVariant: inp.isVariant,
      perServing: inp.perServing, macroBasis: inp.macroBasis,
      ...(summary.verdict ? { verdict: summary.verdict } : {}),
      componentVerdicts,
    };
  });

  const steps: CompareStepList[] = inputs.map((inp) => ({
    versionId: inp.versionId,
    steps: [...inp.content.steps].sort((a, b) => a.order - b.order)
      .map((s) => ({ order: s.order, ...(s.section ? { section: s.section } : {}), text: s.instructionText })),
  }));

  return { columns, ingredients: rows, steps };
}
```

- [ ] **Step 4: Export from `index.ts`**

In `packages/core/src/index.ts`, after line 11 (the feedback type export), add:

```ts
export { buildCompareView } from "./compare.js";
export type { CompareView, CompareColumn, CompareIngredientRow, CompareStepList, CompareInput } from "./compare.js";
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @batch/core test` then `pnpm --filter @batch/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/compare.ts packages/core/src/index.ts packages/core/test/compare.test.ts
git commit -m "feat(core): compare.ts ingredient-matrix builder (CM-1/CM-2)"
```

---

## Task 4: `RecipeService.compare()` (core)

**Files:**
- Modify: `packages/core/src/recipe-service.ts` (add method + import)
- Test: `packages/core/test/recipe-service.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/recipe-service.test.ts`:

```ts
describe("service.compare (CM-3)", () => {
  async function seedIng(s: ReturnType<typeof makeService>) {
    await s.addIngredient({ id: "ing-sugar", name: "Sugar", macrosPer100g: { calories: 400, protein: 0, carbs: 100, fat: 0, fiber: 0 } });
    await s.addIngredient({ id: "ing-corn", name: "Cornstarch", macrosPer100g: { calories: 380, protein: 0, carbs: 91, fat: 0, fiber: 0 } });
  }
  function cookie(withCorn: boolean): RecipeContent {
    const slots = [{ componentKey: "sg", name: "sugar", resolution: { kind: "raw" as const, libraryIngredientId: "ing-sugar" } }];
    const usages = [{ componentKey: "usg", stepKey: "s1", slotKey: "sg", quantityValue: 100, quantityUnit: "g" }];
    if (withCorn) {
      slots.push({ componentKey: "cn", name: "cornstarch", resolution: { kind: "raw" as const, libraryIngredientId: "ing-corn" } });
      usages.push({ componentKey: "ucn", stepKey: "s1", slotKey: "cn", quantityValue: 10, quantityUnit: "g" });
    }
    return { steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }], slots, usages };
  }

  it("aligns separate roots; only the cornstarch user has a value, others null", async () => {
    const s = makeService();
    await seedIng(s);
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: cookie(true) });
    const b = await s.createRecipe({ name: "B", yield: { amount: 1, unit: "x" }, content: cookie(false) });
    const view = await s.compare([a.version.id, b.version.id]);
    const corn = view.ingredients.find((r) => r.ingredientId === "ing-corn")!;
    expect(corn.perServingGrams[a.version.id]).toBe(10);
    expect(corn.perServingGrams[b.version.id]).toBeNull();
    expect(view.columns.map((c) => c.name).sort()).toEqual(["A", "B"]);
  });

  it("rejects fewer than two versions", async () => {
    const s = makeService();
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: cookie(false) });
    await expect(s.compare([a.version.id])).rejects.toThrow("at least two");
  });

  it("rejects an unknown version id", async () => {
    const s = makeService();
    const a = await s.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: cookie(false) });
    await expect(s.compare([a.version.id, "nope"])).rejects.toThrow("version not found: nope");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/core exec vitest run test/recipe-service.test.ts`
Expected: FAIL (`s.compare` is not a function).

- [ ] **Step 3: Implement the method**

In `packages/core/src/recipe-service.ts`, update the import on line 10-11 region to add the compare builder/type. Change line 10:

```ts
import { flattenContent, type SubContent } from "./flatten.js";
import { buildCompareView, type CompareInput, type CompareView } from "./compare.js";
```

Add the method inside the class (place it right after `flatten`/`gatherSubContents`, before the feedback section near line 300):

```ts
  /** Align ≥2 versions into the compare view-model (CM-3): ingredient matrix + macros + verdicts. Read-only. */
  async compare(versionIds: VersionId[]): Promise<CompareView> {
    if (versionIds.length < 2) throw new Error("compare needs at least two versions");
    const ingredients = new Map<string, LibraryIngredient>();
    const inputs: CompareInput[] = [];
    for (const id of versionIds) {
      const v = await this.getVersion(id); // throws on unknown id
      const { content } = await this.flatten(id);
      for (const slot of content.slots) {
        if (slot.resolution.kind === "raw" && !ingredients.has(slot.resolution.libraryIngredientId)) {
          const ing = await this.repo.getIngredient(slot.resolution.libraryIngredientId);
          if (ing) ingredients.set(ing.id, ing);
        }
      }
      inputs.push({
        versionId: v.id, recipeId: v.recipeId, name: v.name,
        isVariant: v.derivesFromVersionId !== undefined,
        yield: v.yield,
        perServing: v.macros?.perServing ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        macroBasis: v.macros?.basis ?? "partial",
        content,
        feedback: await this.feedbackForRecipe(v.recipeId),
      });
    }
    return buildCompareView(inputs, ingredients);
  }
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @batch/core test` then `pnpm --filter @batch/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): RecipeService.compare gathers flatten+macros+verdicts (CM-3)"
```

---

## Task 5: `compare` CLI command (cli)

**Files:**
- Modify: `packages/cli/src/commands.ts` (wrapper + import)
- Modify: `packages/cli/src/cli.ts` (verb)
- Test: `packages/cli/test/commands.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append inside `describe("commands", …)` in `packages/cli/test/commands.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/cli exec vitest run test/commands.test.ts`
Expected: FAIL (`cmd.compare` undefined).

- [ ] **Step 3: Add the wrapper**

In `packages/cli/src/commands.ts`, add `CompareView` to the type import (line 2-6 block) and a wrapper. Change the import to include `CompareView`:

```ts
import type {
  Author, CompareView, CurrentVerdicts, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient, Macros,
  MacroSnapshot, OverrideEntry, Rating, Recipe, RecipeContent, RecipeService, RecipeVersion,
  VersionStatus, Yield,
} from "@batch/core";
```

Add after the `tree` function (around line 139):

```ts
export function compare(svc: RecipeService, versionIds: string[]): Promise<CompareView> {
  return svc.compare(versionIds);
}
```

- [ ] **Step 4: Wire the CLI verb**

In `packages/cli/src/cli.ts`, after the `tree` command (line 107-109), add:

```ts
  program.command("compare <versions...>")
    .description("align ≥2 versions side by side: ingredient matrix (by ingredient id) + macros + verdicts")
    .action(async (versions) => out(await cmd.compare(makeService(), versions)));
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @batch/cli test` then `pnpm --filter @batch/cli typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/src/cli.ts packages/cli/test/commands.test.ts
git commit -m "feat(cli): compare command (CM-3)"
```

---

## Task 6: `rebase.ts` pure merge plan (core)

**Files:**
- Create: `packages/core/src/rebase.ts`
- Modify: `packages/core/src/index.ts` (exports)
- Test: `packages/core/test/rebase.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/rebase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { materialize } from "../src/materialize.js";
import { buildRebasePlan } from "../src/rebase.js";
import type { OverrideSet, RecipeContent } from "../src/types.js";

// A base content with three usages keyed u-sugar / u-corn (corn optional) and a step s1.
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
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/core exec vitest run test/rebase.test.ts`
Expected: FAIL (`../src/rebase.js` does not exist).

- [ ] **Step 3: Implement `rebase.ts`**

Create `packages/core/src/rebase.ts`:

```ts
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

function arrayFor(c: RecipeContent, kind: ComponentKind): Component[] {
  return (kind === "step" ? c.steps : kind === "slot" ? c.slots : c.usages) as Component[];
}
function indexFor(c: RecipeContent, kind: ComponentKind): Map<ComponentKey, Component> {
  return new Map(arrayFor(c, kind).map((x) => [x.componentKey, x]));
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
    step: indexFor(baseNew, "step"), slot: indexFor(baseNew, "slot"), usage: indexFor(baseNew, "usage"),
  };
  const reconciled: OverrideEntry[] = [];
  const targeted = new Set<string>();

  for (const entry of variant.entries) {
    const map = working[entry.kind];
    if (entry.op === "add") {
      const key = entry.payload.componentKey;
      targeted.add(`${entry.kind}:${key}`);
      reconciled.push(map.has(key)
        ? ({ op: "replace", kind: entry.kind, target: key, payload: entry.payload } as OverrideEntry)
        : entry);
      map.set(key, entry.payload as Component);
    } else if (entry.op === "replace") {
      targeted.add(`${entry.kind}:${entry.target}`);
      reconciled.push(map.has(entry.target)
        ? entry
        : ({ op: "add", kind: entry.kind, payload: entry.payload } as OverrideEntry));
      map.set(entry.target, entry.payload as Component);
    } else { // remove
      targeted.add(`${entry.kind}:${entry.target}`);
      if (map.has(entry.target)) { reconciled.push(entry); map.delete(entry.target); }
      // base already removed it → drop the entry (removing a missing key would throw)
    }
  }

  const changed = changedKeys(baseOld, baseNew);
  const b1 = { step: indexFor(baseNew, "step"), slot: indexFor(baseNew, "slot"), usage: indexFor(baseNew, "usage") };
  const conflicts: RebaseConflict[] = [];
  for (const id of targeted) {
    if (!changed.has(id)) continue;
    const i = id.indexOf(":");
    const kind = id.slice(0, i) as ComponentKind;
    const key = id.slice(i + 1);
    const baseNewVal = b1[kind].get(key) ?? null;
    conflicts.push({
      kind, componentKey: key,
      type: baseNewVal === null ? "base-removed" : "both-changed",
      baseNew: baseNewVal,
      variant: working[kind].get(key) ?? null,
    });
  }

  return { overrideSet: { ...variant, entries: reconciled }, conflicts };
}
```

- [ ] **Step 4: Export from `index.ts`**

In `packages/core/src/index.ts`, after the compare exports added in Task 3, add:

```ts
export { buildRebasePlan } from "./rebase.js";
export type { RebasePlan, RebaseConflict } from "./rebase.js";
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @batch/core test` then `pnpm --filter @batch/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/rebase.ts packages/core/src/index.ts packages/core/test/rebase.test.ts
git commit -m "feat(core): rebase.ts 3-way merge plan, variant-wins + conflicts (CM-5)"
```

---

## Task 7: `RecipeService.rebase()` (core)

**Files:**
- Modify: `packages/core/src/recipe-service.ts` (import + method + `RebaseResult` type)
- Modify: `packages/core/src/index.ts` (export `RebaseResult`)
- Test: `packages/core/test/recipe-service.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/recipe-service.test.ts`:

```ts
describe("service.rebase (CM-5/CM-6)", () => {
  function twoSlot(sugar: number): RecipeContent {
    return {
      steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }],
      slots: [{ componentKey: "sl-sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
      usages: [{ componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: sugar, quantityUnit: "g" }],
    };
  }

  it("propagates a clean base improvement into the variant and re-points the lineage", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const variant = await s.deriveVariant({ baseVersionId: base.version.id, name: "V" });
    // variant tweaks the step only
    await s.applyOverride({ versionId: variant.version.id, entry: { op: "replace", kind: "step", target: "s1",
      payload: { componentKey: "s1", order: 1, instructionText: "bake longer" } } });
    const variantHead = (await s.getRecipe(variant.recipe.id)).headVersionId;
    // base cuts sugar 100→80
    const base2 = await s.applyOverride({ versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 80, quantityUnit: "g" } } });
    const { version, conflicts } = await s.rebase({ variantVersionId: variantHead, ontoVersionId: base2.version.id });
    expect(conflicts).toEqual([]);
    expect(version.derivesFromVersionId).toBe(base2.version.id);
    expect(version.content.usages.find((u) => u.componentKey === "u-sugar")?.quantityValue).toBe(80); // propagated
    expect(version.content.steps[0]?.instructionText).toBe("bake longer"); // variant kept
    expect((await s.getRecipe(variant.recipe.id)).headVersionId).toBe(version.id); // head advanced
  });

  it("reports a conflict when base and variant both changed the same usage (variant-wins)", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const variant = await s.deriveVariant({ baseVersionId: base.version.id, name: "V" });
    const v2 = await s.applyOverride({ versionId: variant.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 120, quantityUnit: "g" } } });
    const base2 = await s.applyOverride({ versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 80, quantityUnit: "g" } } });
    const { version, conflicts } = await s.rebase({ variantVersionId: v2.version.id, ontoVersionId: base2.version.id });
    expect(version.content.usages.find((u) => u.componentKey === "u-sugar")?.quantityValue).toBe(120); // variant-wins
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.componentKey).toBe("u-sugar");
  });

  it("rejects rebasing a root (not a variant)", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    await expect(s.rebase({ variantVersionId: base.version.id, ontoVersionId: base.version.id }))
      .rejects.toThrow("not a variant");
  });

  it("rejects a cross-lineage onto target (CM-6)", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const other = await s.createRecipe({ name: "Other", yield: { amount: 1, unit: "x" }, content: twoSlot(100) });
    const variant = await s.deriveVariant({ baseVersionId: base.version.id, name: "V" });
    await expect(s.rebase({ variantVersionId: variant.version.id, ontoVersionId: other.version.id }))
      .rejects.toThrow("across lineages");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/core exec vitest run test/recipe-service.test.ts`
Expected: FAIL (`s.rebase` is not a function).

- [ ] **Step 3: Implement `rebase` + `RebaseResult`**

In `packages/core/src/recipe-service.ts`, add the rebase import next to the compare import (after the line added in Task 4):

```ts
import { buildCompareView, type CompareInput, type CompareView } from "./compare.js";
import { buildRebasePlan, type RebaseConflict } from "./rebase.js";
```

Add a result type above the class (after the `sumLineGrams` helper, before `export class RecipeService`):

```ts
export interface RebaseResult { version: RecipeVersion; conflicts: RebaseConflict[]; }
```

Add the method inside the class (after `compare`):

```ts
  /** Re-point a variant onto an improved version of its own base (CM-5). Variant-wins + conflicts[]. */
  async rebase(input: {
    variantVersionId: VersionId; ontoVersionId: VersionId; author?: Author; commitMessage?: string;
  }): Promise<RebaseResult> {
    const variant = await this.getVersion(input.variantVersionId);
    if (!variant.derivesFromVersionId || !variant.overrideSet) {
      throw new Error(`${input.variantVersionId} is not a variant; nothing to rebase`);
    }
    const baseOld = await this.getVersion(variant.derivesFromVersionId);
    const onto = await this.getVersion(input.ontoVersionId);
    if (onto.recipeId !== baseOld.recipeId) {
      throw new Error(
        `cannot rebase across lineages: ${input.ontoVersionId} is not a version of base recipe ` +
        `${baseOld.recipeId} — use compare + derive + override to converge unrelated recipes`);
    }
    const plan = buildRebasePlan(baseOld.content, onto.content, variant.overrideSet);
    const content = materialize(onto.content, plan.overrideSet);
    for (const slot of content.slots) {
      if (slot.resolution.kind === "sub_recipe") await this.assertAcyclic(variant.recipeId, slot.resolution.subRecipeVersionId);
    }
    const macros = await this.macrosFor(content, variant.yield);
    const version: RecipeVersion = {
      ...variant,
      id: this.deps.newId(),
      prevVersionId: variant.id,
      derivesFromVersionId: onto.id,
      overrideSet: plan.overrideSet,
      content,
      macros,
      author: input.author ?? variant.author,
      commitMessage: input.commitMessage ?? `rebase onto ${onto.id}`,
      status: "draft",
      createdAt: this.deps.now(),
    };
    await this.repo.saveVersion(version);
    await this.repo.setHead(version.recipeId, version.id);
    return { version, conflicts: plan.conflicts };
  }
```

- [ ] **Step 4: Export `RebaseResult`**

In `packages/core/src/index.ts`, change the rebase type export line (from Task 6) to also export the service result:

```ts
export type { RebasePlan, RebaseConflict } from "./rebase.js";
export type { RebaseResult } from "./recipe-service.js";
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @batch/core test` then `pnpm --filter @batch/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/src/index.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): RecipeService.rebase — 3-way merge onto a same-lineage base (CM-5/CM-6)"
```

---

## Task 8: `RecipeService.rebaseVariants()` batch (core)

**Files:**
- Modify: `packages/core/src/recipe-service.ts` (method)
- Test: `packages/core/test/recipe-service.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/recipe-service.test.ts`:

```ts
describe("service.rebaseVariants (CM-8)", () => {
  function oneSlot(sugar: number): RecipeContent {
    return {
      steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }],
      slots: [{ componentKey: "sl-sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
      usages: [{ componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: sugar, quantityUnit: "g" }],
    };
  }

  it("rebases every variant of a base onto the base's head", async () => {
    const s = makeService();
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: oneSlot(100) });
    const va = await s.deriveVariant({ baseVersionId: base.version.id, name: "VA" });
    const vb = await s.deriveVariant({ baseVersionId: base.version.id, name: "VB" });
    // base cuts sugar 100→70 (advances the base head)
    const base2 = await s.applyOverride({ versionId: base.version.id, entry: { op: "replace", kind: "usage", target: "u-sugar",
      payload: { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 70, quantityUnit: "g" } } });
    const { results } = await s.rebaseVariants({ baseVersionId: base2.version.id });
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.version.derivesFromVersionId).toBe(base2.version.id);
      expect(r.version.content.usages[0]?.quantityValue).toBe(70); // propagated to each
      expect(r.conflicts).toEqual([]);
    }
    expect(results.map((r) => r.recipeId).sort()).toEqual([va.recipe.id, vb.recipe.id].sort());
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/core exec vitest run test/recipe-service.test.ts`
Expected: FAIL (`s.rebaseVariants` is not a function).

- [ ] **Step 3: Implement the method**

In `packages/core/src/recipe-service.ts`, add after `rebase`:

```ts
  /** Rebase every variant of a base recipe onto that base's head (CM-8) — the easy-propagate path. */
  async rebaseVariants(input: {
    baseVersionId: VersionId; author?: Author; commitMessage?: string;
  }): Promise<{ results: Array<{ recipeId: RecipeId; version: RecipeVersion; conflicts: RebaseConflict[] }> }> {
    const base = await this.getVersion(input.baseVersionId);
    const baseRecipe = await this.getRecipe(base.recipeId);
    const ontoId = baseRecipe.headVersionId;
    const results: Array<{ recipeId: RecipeId; version: RecipeVersion; conflicts: RebaseConflict[] }> = [];
    for (const r of await this.repo.listRecipes()) {
      if (r.id === base.recipeId) continue;
      const head = await this.repo.getVersion(r.headVersionId);
      if (!head?.derivesFromVersionId) continue;
      const headBase = await this.repo.getVersion(head.derivesFromVersionId);
      if (headBase?.recipeId !== base.recipeId) continue;
      const res = await this.rebase({
        variantVersionId: head.id, ontoVersionId: ontoId,
        author: input.author, commitMessage: input.commitMessage,
      });
      results.push({ recipeId: r.id, version: res.version, conflicts: res.conflicts });
    }
    return { results };
  }
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @batch/core test` then `pnpm --filter @batch/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): RecipeService.rebaseVariants batch propagation (CM-8)"
```

---

## Task 9: `rebase` CLI command + `--all-variants` (cli)

**Files:**
- Modify: `packages/cli/src/commands.ts` (wrappers + import)
- Modify: `packages/cli/src/cli.ts` (verb)
- Test: `packages/cli/test/commands.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append inside `describe("commands", …)` in `packages/cli/test/commands.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/cli exec vitest run test/commands.test.ts`
Expected: FAIL (`cmd.rebase` / `cmd.rebaseAll` undefined).

- [ ] **Step 3: Add the wrappers**

In `packages/cli/src/commands.ts`, add `RebaseResult` and `RebaseConflict` to the type import block, then add wrappers after `compare`:

Change the import block to include the two types:

```ts
import type {
  Author, CompareView, CurrentVerdicts, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient, Macros,
  MacroSnapshot, OverrideEntry, Rating, RebaseConflict, RebaseResult, Recipe, RecipeContent, RecipeService,
  RecipeVersion, VersionStatus, Yield,
} from "@batch/core";
```

Add wrappers (after the `compare` function):

```ts
export function rebase(
  svc: RecipeService, input: { variantVersionId: string; ontoVersionId: string; message?: string },
): Promise<RebaseResult> {
  return svc.rebase({ variantVersionId: input.variantVersionId, ontoVersionId: input.ontoVersionId, commitMessage: input.message });
}
export function rebaseAll(
  svc: RecipeService, baseVersionId: string, message?: string,
): Promise<{ results: Array<{ recipeId: string; version: RecipeVersion; conflicts: RebaseConflict[] }> }> {
  return svc.rebaseVariants({ baseVersionId, commitMessage: message });
}
```

- [ ] **Step 4: Wire the CLI verb**

In `packages/cli/src/cli.ts`, after the `compare` command added in Task 5, add:

```ts
  program.command("rebase <versionId>")
    .description("re-point a variant onto an improved base (--onto), or propagate a base to all its variants (--all-variants)")
    .option("--onto <baseVersionId>", "the improved base version to rebase the variant onto")
    .option("--all-variants", "treat <versionId> as a base and rebase all of its variants onto its head")
    .option("-m, --message <msg>", "commit message")
    .action(async (versionId, opts) => {
      if (opts.allVariants) { out(await cmd.rebaseAll(makeService(), versionId, opts.message)); return; }
      if (!opts.onto) throw new Error("specify --onto <baseVersionId> or --all-variants");
      out(await cmd.rebase(makeService(), { variantVersionId: versionId, ontoVersionId: opts.onto, message: opts.message }));
    });
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm --filter @batch/cli test` then `pnpm --filter @batch/cli typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/src/cli.ts packages/cli/test/commands.test.ts
git commit -m "feat(cli): rebase command + --all-variants (CM-5/CM-8)"
```

---

## Task 10: `promote` (core service + cli)

**Files:**
- Modify: `packages/core/src/recipe-service.ts` (method)
- Modify: `packages/cli/src/commands.ts` (wrapper)
- Modify: `packages/cli/src/cli.ts` (verb)
- Test: `packages/core/test/recipe-service.test.ts` (append), `packages/cli/test/commands.test.ts` (append)

- [ ] **Step 1: Write the failing core test**

Append to `packages/core/test/recipe-service.test.ts`:

```ts
describe("service.promote (CM-4)", () => {
  function withCorn(): RecipeContent {
    return {
      steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }],
      slots: [
        { componentKey: "sl-sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } },
        { componentKey: "sl-corn", name: "corn", resolution: { kind: "raw", libraryIngredientId: "ing-corn" } },
      ],
      usages: [
        { componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 100, quantityUnit: "g" },
        { componentKey: "u-corn", stepKey: "s1", slotKey: "sl-corn", quantityValue: 12, quantityUnit: "g" },
      ],
    };
  }
  function noCorn(): RecipeContent {
    return {
      steps: [{ componentKey: "s1", order: 1, instructionText: "bake" }],
      slots: [{ componentKey: "sl-sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
      usages: [{ componentKey: "u-sugar", stepKey: "s1", slotKey: "sl-sugar", quantityValue: 100, quantityUnit: "g" }],
    };
  }

  it("lifts a slot and auto-includes its usage, baking into the target base", async () => {
    const s = makeService();
    const winner = await s.createRecipe({ name: "Winner", yield: { amount: 1, unit: "x" }, content: withCorn() });
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: noCorn() });
    const { version } = await s.promote({ targetVersionId: base.version.id, sourceVersionId: winner.version.id, componentKeys: ["sl-corn"] });
    expect(version.content.slots.some((sl) => sl.componentKey === "sl-corn")).toBe(true);
    expect(version.content.usages.find((u) => u.componentKey === "u-corn")?.quantityValue).toBe(12); // usage came along
    expect(version.derivesFromVersionId).toBeUndefined(); // target was a root → stays a root (baked in)
  });

  it("throws on an unknown component in the source", async () => {
    const s = makeService();
    const winner = await s.createRecipe({ name: "Winner", yield: { amount: 1, unit: "x" }, content: withCorn() });
    const base = await s.createRecipe({ name: "Base", yield: { amount: 1, unit: "x" }, content: noCorn() });
    await expect(s.promote({ targetVersionId: base.version.id, sourceVersionId: winner.version.id, componentKeys: ["sl-nope"] }))
      .rejects.toThrow("component not found");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @batch/core exec vitest run test/recipe-service.test.ts`
Expected: FAIL (`s.promote` is not a function).

- [ ] **Step 3: Implement `promote`**

In `packages/core/src/recipe-service.ts`, add after `rebaseVariants`. It expands requested keys (a slot pulls its usages), then applies each as one override on the moving target head:

```ts
  /**
   * Bake component(s) from a source version into a target (CM-4) — thin sugar over applyOverride.
   * Promoting a slot also lifts the usages that reference it (so no ingredient is left dangling).
   * Each lifted component is one override (add if the target lacks the key, else replace).
   */
  async promote(input: {
    targetVersionId: VersionId; sourceVersionId: VersionId; componentKeys: ComponentKey[];
    author?: Author; commitMessage?: string;
  }): Promise<{ version: RecipeVersion }> {
    const source = await this.getVersion(input.sourceVersionId);
    const sc = source.content;
    const toLift: Array<{ kind: "step" | "slot" | "usage"; key: ComponentKey }> = [];
    const seen = new Set<string>();
    const add = (kind: "step" | "slot" | "usage", key: ComponentKey): void => {
      const id = `${kind}:${key}`;
      if (!seen.has(id)) { seen.add(id); toLift.push({ kind, key }); }
    };
    for (const key of input.componentKeys) {
      if (sc.steps.some((x) => x.componentKey === key)) add("step", key);
      else if (sc.slots.some((x) => x.componentKey === key)) {
        add("slot", key);
        for (const u of sc.usages) if (u.slotKey === key) add("usage", u.componentKey);
      } else if (sc.usages.some((x) => x.componentKey === key)) add("usage", key);
      else throw new Error(`component not found in source ${input.sourceVersionId}: ${key}`);
    }

    let targetId = input.targetVersionId;
    for (const { kind, key } of toLift) {
      const target = await this.getVersion(targetId);
      const payload =
        kind === "step" ? sc.steps.find((x) => x.componentKey === key)!
        : kind === "slot" ? sc.slots.find((x) => x.componentKey === key)!
        : sc.usages.find((x) => x.componentKey === key)!;
      if (kind === "usage") {
        const stepKey = (payload as StepUsage).stepKey;
        const present = target.content.steps.some((x) => x.componentKey === stepKey) || toLift.some((t) => t.kind === "step" && t.key === stepKey);
        if (!present) throw new Error(`usage ${key} references step ${stepKey} missing in target ${targetId}`);
      }
      const arr = kind === "step" ? target.content.steps : kind === "slot" ? target.content.slots : target.content.usages;
      const exists = arr.some((x) => x.componentKey === key);
      const entry: OverrideEntry = exists
        ? ({ op: "replace", kind, target: key, payload } as OverrideEntry)
        : ({ op: "add", kind, payload } as OverrideEntry);
      const { version } = await this.applyOverride({
        versionId: targetId, entry, author: input.author,
        commitMessage: input.commitMessage ?? `promote ${key} from ${input.sourceVersionId}`,
      });
      targetId = version.id;
    }
    return { version: await this.getVersion(targetId) };
  }
```

Required import fix: `promote` uses `as StepUsage`, but `StepUsage` is **not** in the `./types.js` import on lines 1-5. Add it to that import list (e.g. after `SubRecipeMacro,`):

```ts
  RecipeVersion, StepUsage, SubRecipeMacro, VersionId, VersionStatus, Yield,
```

- [ ] **Step 4: Run the core test — expect PASS**

Run: `pnpm --filter @batch/core test` then `pnpm --filter @batch/core typecheck`
Expected: PASS.

- [ ] **Step 5: Write the failing cli test**

Append inside `describe("commands", …)` in `packages/cli/test/commands.test.ts`:

```ts
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
```

- [ ] **Step 6: Run it — expect FAIL, then add the wrapper + verb**

Run: `pnpm --filter @batch/cli exec vitest run test/commands.test.ts` → FAIL (`cmd.promote` undefined).

In `packages/cli/src/commands.ts`, add after `rebaseAll`:

```ts
export function promote(
  svc: RecipeService,
  input: { targetVersionId: string; sourceVersionId: string; componentKeys: string[]; message?: string },
): Promise<{ version: RecipeVersion }> {
  return svc.promote({
    targetVersionId: input.targetVersionId, sourceVersionId: input.sourceVersionId,
    componentKeys: input.componentKeys, commitMessage: input.message,
  });
}
```

In `packages/cli/src/cli.ts`, after the `rebase` command, add:

```ts
  program.command("promote <targetVersionId>")
    .description("bake winning component(s) from a source version into a target base (a slot pulls its usages)")
    .requiredOption("--from <sourceVersionId>", "the version to lift the winning component(s) from")
    .requiredOption("--component <csv>", "comma-separated component keys to promote")
    .option("-m, --message <msg>", "commit message")
    .action(async (targetVersionId, opts) => out(await cmd.promote(makeService(), {
      targetVersionId, sourceVersionId: opts.from,
      componentKeys: String(opts.component).split(",").map((c: string) => c.trim()).filter(Boolean),
      message: opts.message,
    })));
```

- [ ] **Step 7: Run all tests — expect PASS**

Run: `pnpm --filter @batch/cli test` then `pnpm --filter @batch/cli typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/cli/src/commands.ts packages/cli/src/cli.ts packages/core/test/recipe-service.test.ts packages/cli/test/commands.test.ts
git commit -m "feat: promote — lift winning components into a base (CM-4)"
```

---

## Task 11: Skill — the M4 agent loop

**Files:**
- Modify: `.claude/skills/batch/SKILL.md` (add a section after "Recording feedback"; update `list`/commands prose if needed)

- [ ] **Step 1: Add the M4 section**

In `.claude/skills/batch/SKILL.md`, after the "Recording feedback (the tasting log)" section (ends ~line 78) and before "Typical workflow", insert:

````markdown
## Tuning across recipes — compare, promote, rebase (M4)

The quality-driven loop: build a **champion base** from the *best-tasting* choices, then push it to
variants. Judgment (which choice wins, converge vs fork) stays in your conversation; the commands do
the mechanical work.

- **`batch compare <v1> <v2> [v3…]`** — align ≥2 versions into one view: an **ingredient matrix**
  (rows joined by library-ingredient id, cells = grams **per serving**; `null` = the recipe doesn't
  use it, `"present"` = used but the unit can't convert), per-serving **macros**, and the **feedback
  verdicts** — side by side. Read it to see which ingredients diverge and which version tastes best.
- **`batch promote <targetVersionId> --from <sourceVersionId> --component <key>[,<key>]`** — bake a
  winning component from one recipe into a base (a slot also pulls its usages). E.g. cornstarch tested
  best in recipe A → promote `sl-cornstarch` from A into the champion.
- **`batch rebase <variantVersionId> --onto <baseVersionId>`** — re-point a variant onto an improved
  version of **its own base**. Clean base changes flow in automatically; where the base and the variant
  both changed the same component, the **variant wins** and the collision is listed in `conflicts[]`
  (decide per item — adopt the base value with a follow-up `override`, or keep the deliberate fork).
- **`batch rebase <baseVersionId> --all-variants`** — propagate a base's head to **all** its variants
  at once (the easy path once a base change is objectively good).
- **Synthesize a champion** from several recipes: author the blend and `batch create --file blend.json
  --parents <a,b,c> --rationale "cornstarch from A, zest from C"` — it records where the blend came
  from (visible in `tree`).

**Cross-recipe convergence (important):** `rebase` only merges within one lineage (a variant and its
own base). To fold an **unrelated** root into a champion's family, don't look for a merge command —
read `compare`, `derive` from the champion, and apply just the genuine differences as `override`s. The
result is a clean variant that shares structure, so future `rebase` keeps working.
````

- [ ] **Step 2: Verify the skill reads cleanly**

Run: `sed -n '60,120p' .claude/skills/batch/SKILL.md` and confirm the new section is well-formed and the surrounding sections are intact.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/batch/SKILL.md
git commit -m "docs(skill): teach M4 compare/promote/rebase + provenance"
```

---

## Final verification (after all tasks)

- [ ] Run the full suite: `pnpm test` (root → both packages). Expected: all green (87 prior + the new compare/rebase/service/cli tests).
- [ ] Run `pnpm typecheck` (root). Expected: clean.
- [ ] Smoke the CLI against a scratch store end-to-end:

```bash
BATCH_DB=/tmp/m4/db.json ./batch ingredient add <<< '{"id":"ing-sugar","name":"Sugar","macrosPer100g":{"calories":400,"protein":0,"carbs":100,"fat":0,"fiber":0}}' >/dev/null
A=$(BATCH_DB=/tmp/m4/db.json ./batch create <<< '{"name":"A","yield":{"amount":1,"unit":"x"},"content":{"steps":[{"componentKey":"s1","order":1,"instructionText":"bake"}],"slots":[{"componentKey":"sg","name":"sugar","resolution":{"kind":"raw","libraryIngredientId":"ing-sugar"}}],"usages":[{"componentKey":"u","stepKey":"s1","slotKey":"sg","quantityValue":100,"quantityUnit":"g"}]}}' | jq -r .version.id)
B=$(BATCH_DB=/tmp/m4/db.json ./batch create <<< '{"name":"B","yield":{"amount":1,"unit":"x"},"content":{"steps":[{"componentKey":"s1","order":1,"instructionText":"bake"}],"slots":[{"componentKey":"sg","name":"sugar","resolution":{"kind":"raw","libraryIngredientId":"ing-sugar"}}],"usages":[{"componentKey":"u","stepKey":"s1","slotKey":"sg","quantityValue":60,"quantityUnit":"g"}]}}' | jq -r .version.id)
BATCH_DB=/tmp/m4/db.json ./batch compare "$A" "$B"   # expect a sugar row: { [A]:100, [B]:60 }
```

Expected: the compare JSON shows one `ing-sugar` row with per-serving grams 100 (A) and 60 (B).

- [ ] Dispatch the final code reviewer (subagent-driven-development), then proceed to `superpowers:finishing-a-development-branch`.

---

## Self-review notes (plan author)

- **Spec coverage:** CM-1/CM-2 → Task 3; CM-3 → Tasks 4-5; CM-4 → Task 10; CM-5 → Tasks 6-7; CM-6 (cross-lineage reject + skill guidance) → Task 7 + Task 11; CM-7 → Tasks 1-2; CM-8 → Tasks 8-9. Testing strategy → tests in each task; final smoke → Final verification.
- **Type consistency:** `buildRebasePlan(baseOld, baseNew, variantOverrideSet)`, `RebasePlan {overrideSet, conflicts}`, `RebaseConflict {kind, componentKey, type, baseNew, variant}`, `RebaseResult {version, conflicts}`, `buildCompareView(inputs, ingredients) → CompareView {columns, ingredients, steps}`, `CompareInput`, service methods `compare`/`rebase`/`rebaseVariants`/`promote` and cli wrappers `compare`/`rebase`/`rebaseAll`/`promote` — names match across tasks.
- **No repository changes:** confirmed — all new methods use existing `getVersion`/`getRecipe`/`getIngredient`/`saveVersion`/`setHead`/`listRecipes`/`flatten`/`applyOverride`.
````
