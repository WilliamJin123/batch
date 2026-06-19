# Read-Ergonomics Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the read/presentation gap in the Batch CLI so a human can look things up by name, see the cal-per-gram-protein metric, read recipes off a phone, and inspect ingredients — without dropping to `jq`/Python.

**Architecture:** The write/version model is complete; this is purely additive on the read side. Core changes: a name/short-id resolver in `RecipeService`, a `caloriesPerGramProtein` field + per-section breakdown in the macros engine, and a markdown card renderer. CLI changes: wire the resolver into every id-taking command, add a TTY-aware human/JSON output switch, and add `export` / `ingredient show` / `list` filters.

**Tech Stack:** TypeScript, pnpm monorepo (`packages/core`, `packages/cli`), commander, vitest. Tests call command functions directly via `cmd.*` with an in-memory repo.

**Backward-compat invariant:** Output stays JSON when stdout is **not** a TTY (i.e. piped to `jq`), so `build-turtle.sh` / `reseed.sh` keep working untouched. Human tables only render interactively or with `--human`; `--json` forces JSON always.

**Sequencing note:** Tasks are independently shippable. If we trim scope, the high-value subset is **1, 2, 3, 8** (name resolution + ratio + export). 4, 5, 6, 7 are additive polish.

---

### Task 1: `resolveRef` — name / short-id → versionId (core)

**Files:**
- Modify: `packages/core/src/recipe-service.ts` (add method near `getVersion`, ~line 51)
- Test: `packages/core/test/resolve-ref.test.ts` (create)

Resolution order: (1) exact versionId, (2) unique versionId prefix (≥6 chars), (3) exact recipe name (case-insensitive) → its head. Ambiguity or no-match throws an `Error` listing candidates.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { RecipeService } from "../src/recipe-service.js";
import { InMemoryRepository } from "../src/in-memory-repository.js";
import { testDeps } from "./helpers.js"; // mirror existing test setup; inline if no helper

function svc() { return new RecipeService(new InMemoryRepository(), testDeps()); }
const content = () => ({ steps: [{ componentKey: "s1", order: 1, instructionText: "mix" }], slots: [], usages: [] });

describe("resolveRef", () => {
  it("resolves an exact version id", async () => {
    const s = svc();
    const { version } = await s.createRecipe({ name: "Brownies", yield: { amount: 1, unit: "pan" }, content: content() });
    expect(await s.resolveRef(version.id)).toBe(version.id);
  });

  it("resolves a recipe name (case-insensitive) to its head", async () => {
    const s = svc();
    const { version } = await s.createRecipe({ name: "Brownies", yield: { amount: 1, unit: "pan" }, content: content() });
    expect(await s.resolveRef("brownies")).toBe(version.id);
  });

  it("resolves a unique version-id prefix", async () => {
    const s = svc();
    const { version } = await s.createRecipe({ name: "Brownies", yield: { amount: 1, unit: "pan" }, content: content() });
    expect(await s.resolveRef(version.id.slice(0, 8))).toBe(version.id);
  });

  it("throws listing candidates when a name matches >1 recipe", async () => {
    const s = svc();
    await s.createRecipe({ name: "Cake", yield: { amount: 1, unit: "pan" }, content: content() });
    await s.createRecipe({ name: "Cake", yield: { amount: 1, unit: "pan" }, content: content() });
    await expect(s.resolveRef("Cake")).rejects.toThrow(/ambiguous/i);
  });

  it("throws when nothing matches", async () => {
    await expect(svc().resolveRef("nope")).rejects.toThrow(/no recipe or version/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm -C packages/core test resolve-ref` → FAIL (`resolveRef` undefined).

- [ ] **Step 3: Implement** (add to `RecipeService`):

```ts
/** Resolve a user-supplied reference (exact version id, unique id prefix, or recipe name) to a version id. */
async resolveRef(ref: string): Promise<VersionId> {
  const trimmed = ref.trim();
  // 1. exact version id
  if (await this.repo.getVersion(trimmed)) return trimmed;
  // 2. exact recipe name (case-insensitive) -> head
  const recipes = await this.repo.listRecipes();
  const versions = await this.repo.listVersions();
  const nameOf = new Map(versions.map((v) => [v.id, v.name] as const));
  const byName = recipes.filter((r) => (nameOf.get(r.headVersionId) ?? "").toLowerCase() === trimmed.toLowerCase());
  if (byName.length === 1) return byName[0]!.headVersionId;
  if (byName.length > 1) {
    const cands = byName.map((r) => `${nameOf.get(r.headVersionId)} (${r.headVersionId})`).join(", ");
    throw new Error(`ambiguous name "${ref}" matches multiple recipes: ${cands}`);
  }
  // 3. unique version-id prefix (>=6 chars)
  if (trimmed.length >= 6) {
    const hits = versions.filter((v) => v.id.startsWith(trimmed));
    if (hits.length === 1) return hits[0]!.id;
    if (hits.length > 1) throw new Error(`ambiguous id prefix "${ref}" matches ${hits.length} versions`);
  }
  throw new Error(`no recipe or version matches "${ref}"`);
}
```

> Note: recipe `name` lives on the version, not the `Recipe` record — confirm by reading `types.ts` `Recipe` vs `RecipeVersion` before implementing; the head version's `name` is the recipe's display name. Adjust `nameOf` lookup if `Recipe` carries `name` directly.

- [ ] **Step 4: Run to verify pass** — `pnpm -C packages/core test resolve-ref` → PASS.
- [ ] **Step 5: Commit** — `feat(core): resolveRef — name/short-id -> versionId`.

---

### Task 2: Wire `resolveRef` into id-taking CLI commands

**Files:**
- Modify: `packages/cli/src/commands.ts` (every handler that takes a `versionId: string`)
- Test: `packages/cli/test/commands.test.ts` (add a name-resolution case)

Each command handler currently does `await svc.getVersion(versionId)` / `svc.flatten(versionId)` etc. Add `const id = await svc.resolveRef(ref);` at the top and use `id` thereafter. Rename the parameter `versionId` → `ref` for honesty. Apply to: `show`, `resolve`, `scale`, `history`, `macros`, `recompute`, `derive` (base), `override`, `edit`, `compare` (each variadic ref), `rebase` (+ `--onto`), `promote` (target + `--from`), `feedback add`/`list`.

- [ ] **Step 1: Write the failing test**

```ts
it("show resolves a recipe by name", async () => {
  const s = svc();
  await cmd.create(s, { name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content() });
  const shown = await cmd.show(s, "Brownies");
  expect(shown.name).toBe("Brownies");
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (`version not found: Brownies`).
- [ ] **Step 3: Implement** — in each handler, e.g. `show`:

```ts
export async function show(svc: RecipeService, ref: string, opts: ShowOpts = {}) {
  const versionId = await svc.resolveRef(ref);
  const version = await svc.getVersion(versionId);
  // ...unchanged below
}
```

Repeat the one-line `resolveRef` lead-in for every handler listed above. For `compare`, map over the variadic refs: `const ids = await Promise.all(refs.map((r) => svc.resolveRef(r)));`.

- [ ] **Step 4: Run to verify pass** — `pnpm -C packages/cli test` → PASS (existing id-based tests still green; names now work).
- [ ] **Step 5: Commit** — `feat(cli): accept recipe name / id-prefix on all commands`.

---

### Task 3: `caloriesPerGramProtein` on MacroSnapshot (core)

**Files:**
- Modify: `packages/core/src/types.ts` (`MacroSnapshot`, ~line 111)
- Modify: `packages/core/src/compute-macros.ts` (after `perServing`, ~line 87)
- Test: `packages/core/test/compute-macros.test.ts` (add a case)

- [ ] **Step 1: Write the failing test**

```ts
it("reports calories per gram of protein", () => {
  const snap = computeMacros(content(), { amount: 4, unit: "servings" }, lib(sugar, butter));
  expect(snap.caloriesPerGramProtein).toBeCloseTo(snap.total.calories / snap.total.protein, 4);
});
it("leaves the ratio undefined when there is no protein", () => {
  const snap = computeMacros(zeroProteinContent(), { amount: 1, unit: "x" }, lib(sugar));
  expect(snap.caloriesPerGramProtein).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (field undefined / type error).
- [ ] **Step 3: Implement**

In `types.ts`, add to `MacroSnapshot`: `caloriesPerGramProtein?: number;`

In `compute-macros.ts`, after `total` is final and before/with the return:

```ts
const caloriesPerGramProtein = total.protein > 0 ? total.calories / total.protein : undefined;
return { total, perServing, yield: yieldSpec, basis, unresolved, lines, caloriesPerGramProtein };
```

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(core): macros report calories-per-gram-protein ratio`.

---

### Task 4: `macros --by-section` (core + cli)

**Files:**
- Modify: `packages/core/src/recipe-service.ts` (new `macrosBySection(id)` using `flatten` + `macrosFor`)
- Modify: `packages/cli/src/commands.ts` (`macros` handler takes `{ bySection?: boolean }`)
- Modify: `packages/cli/src/cli.ts` (add `--by-section` flag to `macros`)
- Test: `packages/core/test/macros-by-section.test.ts` (create)

Sections live on steps only after flatten. Compute macros on the **flattened** content, then bucket each `MacroLine` by the section of the step its usage belongs to (`usage.stepKey → step.section ?? "Base"`).

- [ ] **Step 1: Write the failing test** — build a 2-section recipe (a `Crust` step + an unsectioned step), assert `bySection["Crust"].calories` equals the sum of that section's line macros and that section totals sum to `total`.

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** (service):

```ts
async macrosBySection(id: VersionId): Promise<{ snapshot: MacroSnapshot; bySection: Record<string, Macros> }> {
  const { content } = await this.flatten(id);
  const version = await this.getVersion(id);
  const snapshot = await this.macrosFor(content, version.macros?.yield ?? version.content /* yield */ as any);
  const sectionOfStep = new Map(content.steps.map((s) => [s.componentKey, s.section ?? "Base"] as const));
  const slotToStep = new Map(content.usages.map((u) => [u.componentKey, u.stepKey] as const));
  const bySection: Record<string, Macros> = {};
  for (const line of snapshot.lines) {
    if (line.status !== "ok" || !line.macros) continue;
    const usage = content.usages.find((u) => u.slotKey === line.slotKey); // map slot->usage->step->section
    const section = sectionOfStep.get(usage?.stepKey ?? "") ?? "Base";
    bySection[section] = zipMacros(bySection[section] ?? emptyMacros(), line.macros);
  }
  return { snapshot, bySection };
}
```

> Resolve the exact yield source and reuse `zipMacros`/`emptyMacros` from `compute-macros.ts` (export them if not already). Confirm `MacroLine.slotKey` ↔ `usage.slotKey` mapping during implementation; if a slot is used in multiple steps, attribute per usage rather than per slot.

- [ ] **Step 4: CLI wiring** — `macros` command: `.option("--by-section", "break totals down by recipe section")`; handler returns `bySection ? svc.macrosBySection(id) : (await svc.getVersion(id)).macros`.
- [ ] **Step 5: Run tests** → PASS. **Commit** — `feat: macros --by-section breakdown`.

---

### Task 5: TTY-aware human/JSON output (cli)

**Files:**
- Create: `packages/cli/src/format.ts`
- Modify: `packages/cli/src/cli.ts` (`out()` + global `--json`/`--human` option + `.action` wiring)
- Test: `packages/cli/test/format.test.ts` (create)

`out()` decides format: explicit `--json` → JSON; explicit `--human` → human; else `process.stdout.isTTY ? human : json`. The formatter renders known shapes (list rows, MacroSnapshot, LibraryIngredient, RecipeVersion) and falls back to pretty JSON for anything else.

- [ ] **Step 1: Write the failing test** for `format.ts` (pure, no TTY needed):

```ts
import { renderHuman } from "../src/format.js";
it("renders a macro snapshot as a readable block", () => {
  const txt = renderHuman({ total: { calories: 1721.9, protein: 150.9, carbs: 140.8, fat: 61, fiber: 14.7 },
    perServing: { calories: 215.2, protein: 18.9, carbs: 17.6, fat: 7.6, fiber: 1.8 },
    yield: { amount: 8, unit: "slices" }, basis: "complete", unresolved: [], lines: [],
    caloriesPerGramProtein: 11.41 });
  expect(txt).toMatch(/per slice/i);
  expect(txt).toMatch(/11\.4 cal\/g protein/);
});
it("falls back to JSON for unknown shapes", () => {
  expect(renderHuman({ weird: 1 })).toBe(JSON.stringify({ weird: 1 }, null, 2));
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** `format.ts` with `renderHuman(value): string` — a `switch` on detected shape:
  - **MacroSnapshot** (has `perServing` + `total`): a card with `per <unit>` line, whole-yield line, and `caloriesPerGramProtein` rounded to 1 dp as `X.X cal/g protein`.
  - **list rows** (array of `{ name, headVersionId, ... }`): an aligned table (name · short id · tags · to-make).
  - **LibraryIngredient** (has `macrosPer100g`): name + per-100g macros line.
  - **RecipeVersion** (has `content` + `name`): header + section/step outline.
  - default: `JSON.stringify(value, null, 2)`.

- [ ] **Step 4: Wire `cli.ts`** — add `program.option("--json", "force JSON output").option("--human", "force human output")`; change `out` to read `program.opts()` and pick format. Keep the signature `out(value)` so command actions are untouched.
- [ ] **Step 5: Run tests** → PASS (existing tests assert returned objects, not stdout, so unaffected). **Commit** — `feat(cli): TTY-aware human output, --json/--human flags`.

---

### Task 6: `ingredient show <id|name>` (core + cli)

**Files:**
- Modify: `packages/core/src/recipe-service.ts` (`getIngredientRef(ref)` — exact id, else name/alias case-insensitive)
- Modify: `packages/cli/src/commands.ts` (`ingredientShow` handler)
- Modify: `packages/cli/src/cli.ts` (`ingredient show` subcommand)
- Test: `packages/core/test/ingredient-ref.test.ts` (create)

- [ ] **Step 1: Failing test** — add two ingredients, assert `getIngredientRef("ing-x")` and `getIngredientRef("White Sugar")` both resolve; unknown throws.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement**

```ts
async getIngredientRef(ref: string): Promise<LibraryIngredient> {
  const byId = await this.repo.getIngredient(ref);
  if (byId) return byId;
  const all = await this.repo.listIngredients();
  const lc = ref.toLowerCase();
  const hit = all.find((i) => i.name.toLowerCase() === lc || (i.aliases ?? []).some((a) => a.toLowerCase() === lc));
  if (!hit) throw new Error(`no ingredient matches "${ref}"`);
  return hit;
}
```

- [ ] **Step 4: CLI** — `ingredient` command gets a `show <ref>` subcommand → `cmd.ingredientShow(svc, ref)` → `svc.getIngredientRef(ref)`.
- [ ] **Step 5: Run tests** → PASS. **Commit** — `feat: ingredient show <id|name>`.

---

### Task 7: `list --tag` / name search (cli)

**Files:**
- Modify: `packages/cli/src/commands.ts` (`list` handler `ListOpts`)
- Modify: `packages/cli/src/cli.ts` (`list` flags)
- Test: `packages/cli/test/commands.test.ts` (add filter cases)

- [ ] **Step 1: Failing test** — create two recipes with different tags; assert `cmd.list(svc, { tag: "cheesecake" })` returns only the matching one; assert `{ name: "turt" }` substring filter works.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — extend `ListOpts` with `tag?: string; name?: string;`; after building rows, filter: `rows.filter(r => (!opts.tag || r.tags?.includes(opts.tag)) && (!opts.name || r.name.toLowerCase().includes(opts.name.toLowerCase())))`. Ensure `tags` is on the row (add from head version if missing).
- [ ] **Step 4: CLI** — `.option("--tag <tag>", ...)`, `.option("--name <substr>", ...)`.
- [ ] **Step 5: Run tests** → PASS. **Commit** — `feat(cli): list --tag / --name filters`.

---

### Task 8: `export <ref> [--format md|json]` (core + cli)

**Files:**
- Create: `packages/core/src/export-card.ts` (`renderCard(version, flattened, macros, subRecipes): string`)
- Modify: `packages/core/src/recipe-service.ts` (`exportCard(id)` gathers version + flatten + macros + sub-recipe contents)
- Modify: `packages/cli/src/commands.ts` (`exportRecipe` handler)
- Modify: `packages/cli/src/cli.ts` (`export` command)
- Test: `packages/core/test/export-card.test.ts` (create)

Markdown structure mirrors `~/.batch/exports/turtle-protein-cheesecake.md`: title + description, a macro table (per-serving, whole-yield, ratio), ingredients grouped by section, then numbered method steps in `order`. Sub-recipe procedures render as their own labeled subsections (the flatten already sections child steps under the child name).

- [ ] **Step 1: Failing test**

```ts
import { renderCard } from "../src/export-card.js";
it("renders a markdown card with macros and steps", () => {
  const md = renderCard(version, flattenedContent, macros, new Map());
  expect(md).toMatch(/^# /m);            // title heading
  expect(md).toMatch(/cal\/g protein/);  // ratio line
  expect(md).toMatch(/## /);             // section/method headings
  expect(md).toMatch(/1\./);             // numbered steps
});
```

- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** `renderCard`:
  - Heading `# {name}` + italic description.
  - Macro table: `Per {yield.unit}` row (perServing) + `Whole` row (total) + bold `Ratio: X.X cal per gram of protein` from `caloriesPerGramProtein`.
  - **Ingredients** grouped by section: for each section, list `- {slot.name} — {qty} {unit}` for usages whose step is in that section.
  - **Method**: steps sorted by `order`; group by section heading; numbered within. Unsectioned parent steps under "Method"; sub-recipe steps under their child-name section.
  - Keep it pure/string-only (no fs).
- [ ] **Step 4: Service + CLI** — `exportCard(id)` returns the rendered string (md) or the flattened `{ content, macros }` (json). `export` command: `.option("--format <fmt>", "md|json", "md")`; handler returns a string for md (printed raw, not JSON-wrapped) — add an `out`-bypass for raw string payloads.
- [ ] **Step 5: Run tests** → PASS. Manually verify `./batch export "Turtle Protein Cheesecake" > /tmp/card.md` matches the hand-written card's shape. **Commit** — `feat: export <ref> --format md|json (bake card)`.

---

## Self-Review

- **Spec coverage:** all six approved surface items map to tasks — name resolution (1,2), ratio (3), by-section (4), export (8), ingredient show (6), list filters (7); plus the TTY output switch (5) that makes them human-usable. ✓
- **Backward-compat:** Task 5 keeps JSON-on-pipe; existing `cmd.*` tests assert returned objects (not stdout), so they stay green. ✓
- **Open implementation checks flagged inline** (don't block planning, resolve while coding): exact `name` location on `Recipe` vs `RecipeVersion` (Task 1); yield source + `zipMacros`/`emptyMacros` export (Task 4); slot↔usage↔step attribution when a slot is reused across steps (Task 4); raw-string output bypass for `export` md (Task 8).
- **Type consistency:** `resolveRef` (Task 1) is the single name used in Tasks 2/4/6/8 wiring. ✓
