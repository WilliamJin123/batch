# Recipe Feedback (Tasting Log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an append-only feedback subsystem to Batch — `to-make` intent + `made` outcomes on a 4-point ordinal scale, component-targeted, with derived tried/queue/verdict rollups — without ever writing a recipe version or touching macros.

**Architecture:** Feedback is its own collection in the `Db` (beside `recipes`/`versions`/`ingredients`), normalized on load so old stores open unchanged. A pure module (`feedback.ts`) holds all rollup/derivation logic (`summarizeFeedback`, `currentVerdicts`, recency sort); the `RecipeService` is a thin write/read wrapper that loads entries and calls the pure functions. The CLI adds a `feedback` command group and feedback fields to `list`. Nothing here calls `computeMacros`/`materialize`/`flattenContent`, writes a `RecipeVersion`, or moves a head.

**Tech Stack:** TypeScript (strict ESM), pnpm monorepo (`@batch/core` + `@batch/cli`), Vitest, commander. Tests live in `packages/<pkg>/test/`. Run a single file with `pnpm --filter @batch/core test <file>` or all with `pnpm -r test`. The CLI runs via the repo-root `./batch` shim (tsx, no build).

**Spec:** `docs/superpowers/specs/2026-06-15-recipe-feedback-design.md` (decisions DF-1…DF-6).

**Conventions to match:**
- Repository methods come in `save*` / `get*` / `list*` quartets (see the `ingredient` block in every repository file). Add a `delete*` for feedback (DF-5).
- The CLI emits **JSON** for everything via `out()`. The "★ / good / ⚠ / ☐" markers from the spec are **fields** (`tried`/`queued`/`verdict`) on the JSON rows — the human/skill renders the glyphs. Do not print ANSI symbols.
- Optional fields are assigned directly (e.g. `description: input.description`); `exactOptionalPropertyTypes` is off (proven by `recipe-service.ts:74`).
- Commit per task. Conventional-commit prefixes: `feat(core)`, `feat(cli)`, `docs(skill)`.

---

## File structure

**core (`packages/core/src/`)**
- `types.ts` *(modify)* — add `Rating`, `FeedbackKind`, `FeedbackBase`, `FeedbackEntry`.
- `feedback.ts` *(new, pure)* — `latestFirst`, `summarizeRecipe`, `summarizeFeedback`, `currentVerdicts` + their result types. One responsibility: derive views from a list of entries.
- `repository.ts` *(modify)* — add the feedback quartet to the interface.
- `in-memory-repository.ts` *(modify)* — implement the quartet over a `Map`.
- `recipe-service.ts` *(modify)* — `addFeedback`, `deleteFeedback`, `feedbackForRecipe`, `feedbackForVersion`, `feedbackSummary`.
- `index.ts` *(modify)* — export the new `feedback.ts` functions/types.

**cli (`packages/cli/src/`)**
- `file-repository.ts` *(modify)* — add `feedback` to `Db` + `load()` normalization + the quartet.
- `commands.ts` *(modify)* — `feedback`, `feedbackList`, `feedbackRemove`; extend `list` with feedback fields + `--to-make` filter.
- `cli.ts` *(modify)* — wire the `feedback` command group + `list --to-make`.

**docs / data**
- `.claude/skills/batch/SKILL.md` *(modify)* — a "recording feedback" section.
- `~/.batch/sources/reseed.sh` + `~/.batch` store *(modify, gated on user OK)* — record the real verdicts.

---

## Task 1: Core types + pure feedback module

**Files:**
- Modify: `packages/core/src/types.ts` (append after the existing exports)
- Create: `packages/core/src/feedback.ts`
- Create: `packages/core/test/feedback.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/feedback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeFeedback, summarizeRecipe, currentVerdicts, latestFirst } from "../src/feedback.js";
import type { FeedbackEntry } from "../src/types.js";

// minimal entry builder; override any field via `p`
function entry(p: Partial<FeedbackEntry> & Pick<FeedbackEntry, "kind">): FeedbackEntry {
  const base = {
    id: "f", recipeId: "r1", versionId: "v1",
    date: "2026-06-01", author: "user" as const, createdAt: "2026-06-01T00:00:00.000Z",
  };
  return { ...base, ...p } as FeedbackEntry;
}

describe("latestFirst", () => {
  it("sorts by date desc then createdAt desc", () => {
    const a = entry({ kind: "to-make", id: "a", date: "2026-06-01", createdAt: "2026-06-01T01:00:00.000Z" });
    const b = entry({ kind: "to-make", id: "b", date: "2026-06-02", createdAt: "2026-06-02T00:00:00.000Z" });
    const c = entry({ kind: "to-make", id: "c", date: "2026-06-01", createdAt: "2026-06-01T05:00:00.000Z" });
    expect(latestFirst([a, b, c]).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
});

describe("summarizeRecipe", () => {
  it("untried + unqueued when empty", () => {
    expect(summarizeRecipe([])).toEqual({ tried: false, queued: false });
  });
  it("queued when the most-recent entry is to-make", () => {
    expect(summarizeRecipe([entry({ kind: "to-make", id: "a", date: "2026-06-03" })]))
      .toEqual({ tried: false, queued: true });
  });
  it("tried with a dish verdict; not queued once made is latest", () => {
    expect(summarizeRecipe([
      entry({ kind: "to-make", id: "a", date: "2026-06-01" }),
      entry({ kind: "made", id: "b", date: "2026-06-02", rating: "good" }),
    ])).toEqual({ tried: true, queued: false, verdict: "good" });
  });
  it("dish verdict ignores component-scoped made entries", () => {
    const s = summarizeRecipe([
      entry({ kind: "made", id: "b", date: "2026-06-02", rating: "good" }),
      entry({ kind: "made", id: "g", date: "2026-06-03", rating: "bad", componentKey: "sl-glaze" }),
    ]);
    expect(s.verdict).toBe("good"); // dish, not the glaze
    expect(s.queued).toBe(false);
  });
});

describe("currentVerdicts", () => {
  it("returns the newest made per scope (recency-supersede)", () => {
    const cv = currentVerdicts([
      entry({ kind: "made", id: "d", date: "2026-06-01", rating: "good" }),
      entry({ kind: "made", id: "g1", date: "2026-06-01", rating: "bad", componentKey: "sl-glaze" }),
      entry({ kind: "made", id: "g2", date: "2026-06-05", rating: "okay", componentKey: "sl-glaze" }),
    ]);
    expect(cv.dish?.rating).toBe("good");
    expect(cv.components["sl-glaze"]?.rating).toBe("okay");
  });
});

describe("summarizeFeedback", () => {
  it("groups by recipeId", () => {
    const out = summarizeFeedback([
      entry({ kind: "made", id: "a", recipeId: "r1", rating: "excellent" }),
      entry({ kind: "to-make", id: "b", recipeId: "r2", date: "2026-06-09" }),
    ]);
    expect(out["r1"]).toEqual({ tried: true, queued: false, verdict: "excellent" });
    expect(out["r2"]).toEqual({ tried: false, queued: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @batch/core test feedback`
Expected: FAIL — cannot find module `../src/feedback.js` (and `FeedbackEntry` not exported from types).

- [ ] **Step 3: Add the types**

Append to `packages/core/src/types.ts` (after `Recipe`, at end of file):

```ts
// --- Feedback (tasting log) — append-only, orthogonal to the version chain ---

/** Ordinal, worst→best. `excellent` is the "favorite"/starred tier. */
export type Rating = "bad" | "okay" | "good" | "excellent";
export type FeedbackKind = "to-make" | "made";

export interface FeedbackBase {
  id: string;
  recipeId: RecipeId;            // lineage — for rollup
  versionId: VersionId;          // the exact version tasted/queued (provenance)
  componentKey?: ComponentKey;   // optional target within that version (e.g. sl-glaze)
  notes?: string;
  date: string;                  // when baked/queued (ISO-8601)
  author: Author;
  createdAt: string;             // when the record was written (ISO-8601)
}

export type FeedbackEntry =
  | ({ kind: "to-make" } & FeedbackBase)                 // intent — no rating
  | ({ kind: "made"; rating?: Rating } & FeedbackBase);  // outcome — rating optional but encouraged
```

- [ ] **Step 4: Write the pure module**

Create `packages/core/src/feedback.ts`:

```ts
import type { ComponentKey, FeedbackEntry, Rating, RecipeId } from "./types.js";

export interface RecipeFeedbackSummary {
  tried: boolean;
  queued: boolean;
  verdict?: Rating; // latest dish-scoped `made` rating
}

type MadeEntry = Extract<FeedbackEntry, { kind: "made" }>;

export interface CurrentVerdicts {
  dish?: MadeEntry;
  components: Record<ComponentKey, MadeEntry>;
}

/** Newest first: by `date` desc, then `createdAt` desc (deterministic tiebreak). Pure — no mutation. */
export function latestFirst(entries: FeedbackEntry[]): FeedbackEntry[] {
  return [...entries].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Roll a single recipe's entries up to {tried, queued, verdict}. */
export function summarizeRecipe(entries: FeedbackEntry[]): RecipeFeedbackSummary {
  const sorted = latestFirst(entries);
  const tried = sorted.some((e) => e.kind === "made");
  const queued = sorted[0]?.kind === "to-make";
  const dish = sorted.find(
    (e): e is MadeEntry => e.kind === "made" && e.componentKey === undefined,
  );
  return { tried, queued, ...(dish?.rating ? { verdict: dish.rating } : {}) };
}

/** Group ALL entries by recipeId and summarize each. */
export function summarizeFeedback(entries: FeedbackEntry[]): Record<RecipeId, RecipeFeedbackSummary> {
  const byRecipe = new Map<RecipeId, FeedbackEntry[]>();
  for (const e of entries) {
    const list = byRecipe.get(e.recipeId) ?? [];
    list.push(e);
    byRecipe.set(e.recipeId, list);
  }
  const out: Record<RecipeId, RecipeFeedbackSummary> = {};
  for (const [recipeId, list] of byRecipe) out[recipeId] = summarizeRecipe(list);
  return out;
}

/** Most-recent `made` entry per scope (dish + each component) — the live verdicts. */
export function currentVerdicts(entries: FeedbackEntry[]): CurrentVerdicts {
  const made = latestFirst(entries).filter((e): e is MadeEntry => e.kind === "made");
  const dish = made.find((e) => e.componentKey === undefined);
  const components: Record<ComponentKey, MadeEntry> = {};
  for (const e of made) {
    if (e.componentKey === undefined) continue;
    if (!(e.componentKey in components)) components[e.componentKey] = e; // newest-first → first wins
  }
  return { ...(dish ? { dish } : {}), components };
}
```

- [ ] **Step 5: Export from the package index**

In `packages/core/src/index.ts`, add after the `flattenContent` export line:

```ts
export { latestFirst, summarizeRecipe, summarizeFeedback, currentVerdicts } from "./feedback.js";
export type { RecipeFeedbackSummary, CurrentVerdicts } from "./feedback.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @batch/core test feedback`
Expected: PASS (all 7 cases).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/feedback.ts packages/core/src/index.ts packages/core/test/feedback.test.ts
git commit -m "feat(core): feedback types + pure rollup module (tried/queued/verdict)"
```

---

## Task 2: Repository interface + InMemoryRepository feedback quartet

**Files:**
- Modify: `packages/core/src/repository.ts`
- Modify: `packages/core/src/in-memory-repository.ts`
- Test: `packages/core/test/recipe-service.test.ts` (the `InMemoryRepository` describe block at the top)

- [ ] **Step 1: Write the failing test**

In `packages/core/test/recipe-service.test.ts`, inside the existing `describe("InMemoryRepository", …)` block, add:

```ts
  it("stores, lists, and deletes feedback entries", async () => {
    const repo = new InMemoryRepository();
    await repo.saveFeedback({
      kind: "made", id: "f1", recipeId: "r1", versionId: "v1", rating: "good",
      date: "2026-06-01", author: "user", createdAt: "2026-06-01T00:00:00.000Z",
    });
    expect((await repo.getFeedback("f1"))?.kind).toBe("made");
    expect(await repo.listFeedback()).toHaveLength(1);
    await repo.deleteFeedback("f1");
    expect(await repo.getFeedback("f1")).toBeUndefined();
    expect(await repo.listFeedback()).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @batch/core test recipe-service`
Expected: FAIL — `repo.saveFeedback is not a function`.

- [ ] **Step 3: Extend the Repository interface**

In `packages/core/src/repository.ts`, update the import and add four methods:

```ts
import type { FeedbackEntry, LibraryIngredient, Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";
```

Add inside the `Repository` interface (after the ingredient methods):

```ts
  saveFeedback(entry: FeedbackEntry): Promise<void>;
  getFeedback(id: string): Promise<FeedbackEntry | undefined>;
  listFeedback(): Promise<FeedbackEntry[]>;
  deleteFeedback(id: string): Promise<void>;
```

- [ ] **Step 4: Implement on InMemoryRepository**

In `packages/core/src/in-memory-repository.ts`, update the import to include `FeedbackEntry`, add a field, and add the methods:

```ts
import type { FeedbackEntry, LibraryIngredient, Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";
```

Add the field beside the others:

```ts
  private feedback = new Map<string, FeedbackEntry>();
```

Add the methods (after `listIngredients`):

```ts
  async saveFeedback(entry: FeedbackEntry): Promise<void> {
    this.feedback.set(entry.id, structuredClone(entry));
  }
  async getFeedback(id: string): Promise<FeedbackEntry | undefined> {
    const f = this.feedback.get(id);
    return f ? structuredClone(f) : undefined;
  }
  async listFeedback(): Promise<FeedbackEntry[]> {
    return [...this.feedback.values()].map((f) => structuredClone(f));
  }
  async deleteFeedback(id: string): Promise<void> {
    this.feedback.delete(id);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @batch/core test recipe-service`
Expected: PASS (existing tests + the new feedback persistence case).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/repository.ts packages/core/src/in-memory-repository.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): feedback quartet on Repository + InMemoryRepository"
```

---

## Task 3: Service write path — `addFeedback` + `deleteFeedback`

**Files:**
- Modify: `packages/core/src/recipe-service.ts`
- Test: `packages/core/test/recipe-service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/recipe-service.test.ts`:

```ts
describe("addFeedback / deleteFeedback", () => {
  it("appends an entry pinned to the version, resolves recipeId, and writes NO new version", async () => {
    const svc = makeService();
    const { recipe, version } = await svc.createRecipe({
      name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    const before = (await svc.listVersions()).length;
    const fb = await svc.addFeedback({ versionId: version.id, kind: "made", rating: "good", notes: "tasty" });
    expect(fb.recipeId).toBe(recipe.id);
    expect(fb.versionId).toBe(version.id);
    expect(fb.kind).toBe("made");
    expect((await svc.listVersions()).length).toBe(before);                 // no version churn (DF-6)
    expect((await svc.getRecipe(recipe.id)).headVersionId).toBe(version.id); // head unmoved
  });
  it("rejects feedback on an unknown version", async () => {
    const svc = makeService();
    await expect(svc.addFeedback({ versionId: "nope", kind: "to-make" })).rejects.toThrow(/version not found/);
  });
  it("deleteFeedback removes the one entry", async () => {
    const svc = makeService();
    const { version } = await svc.createRecipe({ name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const fb = await svc.addFeedback({ versionId: version.id, kind: "to-make" });
    await svc.deleteFeedback(fb.id);
    expect(await svc.feedbackForVersion(version.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @batch/core test recipe-service`
Expected: FAIL — `svc.addFeedback is not a function`.

- [ ] **Step 3: Implement the write path (and the reads this test needs)**

In `packages/core/src/recipe-service.ts`:

Extend the type import (line 1-4 block) to add the new names:

```ts
import type {
  Author, ComponentKey, FeedbackBase, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient,
  MacroLine, MacroSnapshot, OverrideEntry, OverrideSet, Rating, Recipe, RecipeContent, RecipeId,
  RecipeVersion, SubRecipeMacro, VersionId, VersionStatus, Yield,
} from "./types.js";
```

Add the feedback imports below the existing `flatten` import:

```ts
import { summarizeFeedback, latestFirst, type RecipeFeedbackSummary } from "./feedback.js";
```

Add these methods to the `RecipeService` class (e.g. just before `staleness`):

```ts
  /**
   * Append one tasting-log entry, pinned to `versionId` (provenance) and rolled up by its
   * `recipeId`. Append-only and orthogonal: never writes a RecipeVersion or moves a head (DF-6).
   */
  async addFeedback(input: {
    versionId: VersionId;
    kind: FeedbackKind;
    rating?: Rating;
    componentKey?: ComponentKey;
    notes?: string;
    date?: string;
    author?: Author;
  }): Promise<FeedbackEntry> {
    const version = await this.getVersion(input.versionId); // validates existence (throws if unknown)
    const now = this.deps.now();
    const base: FeedbackBase = {
      id: this.deps.newId(),
      recipeId: version.recipeId,
      versionId: version.id,
      componentKey: input.componentKey,
      notes: input.notes,
      date: input.date ?? now,
      author: input.author ?? "user",
      createdAt: now,
    };
    const entry: FeedbackEntry =
      input.kind === "made"
        ? { kind: "made", rating: input.rating, ...base }
        : { kind: "to-make", ...base };
    await this.repo.saveFeedback(entry);
    return entry;
  }

  async deleteFeedback(id: string): Promise<void> {
    await this.repo.deleteFeedback(id);
  }

  async feedbackForRecipe(recipeId: RecipeId): Promise<FeedbackEntry[]> {
    return latestFirst((await this.repo.listFeedback()).filter((e) => e.recipeId === recipeId));
  }
  async feedbackForVersion(versionId: VersionId): Promise<FeedbackEntry[]> {
    return latestFirst((await this.repo.listFeedback()).filter((e) => e.versionId === versionId));
  }
  async feedbackSummary(): Promise<Record<RecipeId, RecipeFeedbackSummary>> {
    return summarizeFeedback(await this.repo.listFeedback());
  }
```

(Note: `feedbackForRecipe`/`feedbackForVersion`/`feedbackSummary` are added here because Task 3's tests call `feedbackForVersion`; Task 4 exercises the summary/rollup behavior in depth.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @batch/core test recipe-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): service addFeedback/deleteFeedback + reads (no version churn)"
```

---

## Task 4: Service rollup + derivation-isolation behavior

**Files:**
- Test: `packages/core/test/recipe-service.test.ts` (no new production code — this locks the rollup/isolation invariants the earlier methods must satisfy)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/recipe-service.test.ts`:

```ts
describe("feedbackSummary rollup", () => {
  it("rolls up per recipe; derivation isolates tried (distinct recipeId)", async () => {
    const svc = makeService();
    const { recipe: rBase, version: base } = await svc.createRecipe({
      name: "Base", yield: { amount: 1, unit: "x" }, content: content(),
    });
    const { recipe: rVar } = await svc.deriveVariant({ baseVersionId: base.id, name: "Variant" });
    await svc.addFeedback({ versionId: base.id, kind: "made", rating: "good" });
    const summary = await svc.feedbackSummary();
    expect(summary[rBase.id]).toEqual({ tried: true, queued: false, verdict: "good" });
    expect(summary[rVar.id]).toBeUndefined(); // variant untouched
  });
  it("in-place override keeps the recipe tried (same recipeId)", async () => {
    const svc = makeService();
    const { recipe, version } = await svc.createRecipe({
      name: "Base", yield: { amount: 1, unit: "x" }, content: content(),
    });
    await svc.addFeedback({ versionId: version.id, kind: "made", rating: "good" });
    const { version: v2 } = await svc.applyOverride({
      versionId: version.id,
      entry: {
        op: "replace", kind: "usage", target: "u1",
        payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 100, quantityUnit: "g" },
      },
    });
    expect(v2.recipeId).toBe(recipe.id);
    expect((await svc.feedbackSummary())[recipe.id]?.tried).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (behavior already implemented in Task 3)**

Run: `pnpm --filter @batch/core test recipe-service`
Expected: PASS. (If either case fails, the bug is in Task 3's `addFeedback`/`feedbackSummary` — fix there, do not weaken the test.)

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/recipe-service.test.ts
git commit -m "test(core): feedback rollup + derivation-isolation invariants"
```

---

## Task 5: FileRepository feedback persistence

**Files:**
- Modify: `packages/cli/src/file-repository.ts`
- Test: `packages/cli/test/file-repository.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/cli/test/file-repository.test.ts`, add inside the `describe("FileRepository", …)` block:

```ts
  it("persists feedback across instances", async () => {
    const a = new FileRepository(DB);
    await a.saveFeedback({
      kind: "made", id: "f1", recipeId: "r1", versionId: "v1", rating: "good",
      date: "2026-06-01", author: "user", createdAt: "2026-06-01T00:00:00.000Z",
    });
    const b = new FileRepository(DB);
    expect((await b.getFeedback("f1"))?.kind).toBe("made");
    expect(await b.listFeedback()).toHaveLength(1);
  });

  it("loads a legacy store written before the feedback key existed", async () => {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(DB, JSON.stringify({ recipes: {}, versions: {}, ingredients: {} }), "utf8");
    const repo = new FileRepository(DB);
    expect(await repo.listFeedback()).toEqual([]);
    expect(await repo.getFeedback("anything")).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @batch/cli test file-repository`
Expected: FAIL — `a.saveFeedback is not a function`.

- [ ] **Step 3: Implement**

In `packages/cli/src/file-repository.ts`:

Add `FeedbackEntry` to the type import:

```ts
import type {
  FeedbackEntry, LibraryIngredient, Recipe, RecipeId, RecipeVersion, VersionId, Repository,
} from "@batch/core";
```

Add `feedback` to the `Db` interface:

```ts
interface Db {
  recipes: Record<string, Recipe>;
  versions: Record<string, RecipeVersion>;
  ingredients: Record<string, LibraryIngredient>;
  feedback: Record<string, FeedbackEntry>;
}
```

In `load()`, add the normalization line in BOTH the parsed branch and the ENOENT default:

```ts
      this.data = {
        recipes: parsed.recipes ?? {},
        versions: parsed.versions ?? {},
        ingredients: parsed.ingredients ?? {},
        feedback: parsed.feedback ?? {},
      };
```

```ts
        this.data = { recipes: {}, versions: {}, ingredients: {}, feedback: {} };
```

Add the quartet after `listIngredients`:

```ts
  async saveFeedback(entry: FeedbackEntry): Promise<void> {
    const d = await this.load();
    d.feedback[entry.id] = structuredClone(entry);
    await this.flush();
  }
  async getFeedback(id: string): Promise<FeedbackEntry | undefined> {
    const f = (await this.load()).feedback[id];
    return f ? structuredClone(f) : undefined;
  }
  async listFeedback(): Promise<FeedbackEntry[]> {
    return Object.values((await this.load()).feedback).map((f) => structuredClone(f));
  }
  async deleteFeedback(id: string): Promise<void> {
    const d = await this.load();
    delete d.feedback[id];
    await this.flush();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @batch/cli test file-repository`
Expected: PASS (including the existing legacy-store test, which proves old stores still open).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/file-repository.ts packages/cli/test/file-repository.test.ts
git commit -m "feat(cli): persist feedback in FileRepository (old stores still load)"
```

---

## Task 6: CLI command functions — `feedback` / `feedbackList` / `feedbackRemove`

**Files:**
- Modify: `packages/cli/src/commands.ts`
- Test: `packages/cli/test/commands.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/test/commands.test.ts` (inside the `describe("commands", …)` block, or a new sibling describe):

```ts
  it("feedback: append made + component-scoped made, then list shows current verdicts", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "Cookie", yield: { amount: 3, unit: "cookies" }, content: content() });
    await cmd.feedback(s, { versionId: version.id, kind: "made", rating: "good", notes: "great" });
    await cmd.feedback(s, { versionId: version.id, kind: "made", rating: "bad", component: "sugar", notes: "too sweet" });
    const view = await cmd.feedbackList(s, version.id);
    expect(view.current.dish?.rating).toBe("good");
    expect(view.current.components["sugar"]?.rating).toBe("bad");
    expect(view.history).toHaveLength(2);
  });

  it("feedback rm deletes an entry", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const fb = await cmd.feedback(s, { versionId: version.id, kind: "to-make" });
    await cmd.feedbackRemove(s, fb.id);
    expect((await cmd.feedbackList(s, version.id)).history).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @batch/cli test commands`
Expected: FAIL — `cmd.feedback is not a function`.

- [ ] **Step 3: Implement the command functions**

In `packages/cli/src/commands.ts`:

Extend the type import block to add the feedback types:

```ts
import type {
  Author, CurrentVerdicts, FeedbackEntry, FeedbackKind, FlattenSource, LibraryIngredient, Macros,
  MacroSnapshot, OverrideEntry, Rating, Recipe, RecipeContent, RecipeService, RecipeVersion,
  VersionStatus, Yield,
} from "@batch/core";
```

Add the `currentVerdicts` value import at the top (it is a function, not a type):

```ts
import { scale as scaleContent, currentVerdicts } from "@batch/core";
```

Add the command functions (e.g. after `recompute`):

```ts
// --- feedback (tasting log) ---

export interface FeedbackInput {
  versionId: string;
  kind: FeedbackKind;
  rating?: Rating;
  component?: string;
  notes?: string;
  date?: string;
}
export function feedback(svc: RecipeService, input: FeedbackInput): Promise<FeedbackEntry> {
  return svc.addFeedback({
    versionId: input.versionId,
    kind: input.kind,
    rating: input.rating,
    componentKey: input.component,
    notes: input.notes,
    date: input.date,
  });
}

export interface FeedbackView {
  recipeId: string;
  current: CurrentVerdicts;
  history: FeedbackEntry[];
}
export async function feedbackList(svc: RecipeService, versionId: string): Promise<FeedbackView> {
  const version = await svc.getVersion(versionId);
  const history = await svc.feedbackForRecipe(version.recipeId);
  return { recipeId: version.recipeId, current: currentVerdicts(history), history };
}

export function feedbackRemove(svc: RecipeService, id: string): Promise<void> {
  return svc.deleteFeedback(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @batch/cli test commands`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/test/commands.test.ts
git commit -m "feat(cli): feedback command functions (append/list/rm)"
```

---

## Task 7: Extend `list` with feedback markers + `--to-make` filter

**Files:**
- Modify: `packages/cli/src/commands.ts` (`ListRow`, `list`)
- Test: `packages/cli/test/commands.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/test/commands.test.ts`:

```ts
  it("list carries feedback markers and --to-make filters to the queue", async () => {
    const s = svc();
    const { version: a } = await cmd.create(s, { name: "Made-Good", yield: { amount: 1, unit: "x" }, content: content() });
    const { version: b } = await cmd.create(s, { name: "Wishlist", yield: { amount: 1, unit: "x" }, content: content() });
    await cmd.create(s, { name: "Untouched", yield: { amount: 1, unit: "x" }, content: content() });
    await cmd.feedback(s, { versionId: a.id, kind: "made", rating: "good" });
    await cmd.feedback(s, { versionId: b.id, kind: "to-make" });

    const all = await cmd.list(s);
    expect(all.find((r) => r.name === "Made-Good")).toMatchObject({ tried: true, queued: false, verdict: "good" });
    expect(all.find((r) => r.name === "Wishlist")).toMatchObject({ tried: false, queued: true });
    expect(all.find((r) => r.name === "Untouched")).toMatchObject({ tried: false, queued: false });

    const queue = await cmd.list(s, { toMake: true });
    expect(queue.map((r) => r.name)).toEqual(["Wishlist"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @batch/cli test commands`
Expected: FAIL — `list` returns rows without `tried`/`queued`, and ignores `{ toMake: true }`.

- [ ] **Step 3: Implement**

In `packages/cli/src/commands.ts`, replace the `ListRow` interface and `list` function with:

```ts
export interface ListRow {
  recipeId: string; headVersionId: string; name: string;
  status: VersionStatus; tags: string[]; isVariant: boolean;
  kcalPerServing?: number; macroBasis?: "complete" | "partial";
  tried: boolean; queued: boolean; verdict?: Rating;
}
export interface ListOpts { toMake?: boolean }
export async function list(svc: RecipeService, opts: ListOpts = {}): Promise<ListRow[]> {
  const recipes = await svc.listRecipes();
  const summary = await svc.feedbackSummary();
  const rows = await Promise.all(recipes.map(async (r): Promise<ListRow> => {
    const v = await svc.getVersion(r.headVersionId);
    const fb = summary[r.id] ?? { tried: false, queued: false };
    return {
      recipeId: r.id, headVersionId: v.id, name: v.name,
      status: v.status, tags: v.tags, isVariant: v.derivesFromVersionId !== undefined,
      kcalPerServing: v.macros?.perServing.calories, macroBasis: v.macros?.basis,
      tried: fb.tried, queued: fb.queued, ...(fb.verdict ? { verdict: fb.verdict } : {}),
    };
  }));
  const filtered = opts.toMake ? rows.filter((row) => row.queued) : rows;
  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @batch/cli test commands`
Expected: PASS (the existing `list summarizes recipes by head version` test still passes — it only checks names/length).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/test/commands.test.ts
git commit -m "feat(cli): list carries feedback markers + --to-make filter"
```

---

## Task 8: Wire the CLI verbs + scratch-store smoke

**Files:**
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Implement the `feedback` command group**

In `packages/cli/src/cli.ts`, add before the final `await program.parseAsync(...)` line:

```ts
  const feedback = program.command("feedback")
    .description("record and inspect tasting feedback (to-make intent, made outcomes)");
  feedback.command("add <versionId>")
    .description("append a feedback entry: --made (with --rating) or --to-make")
    .option("--made", "record an outcome (you baked it)")
    .option("--to-make", "queue it as something you want to make")
    .option("--rating <r>", "bad | okay | good | excellent (only with --made)")
    .option("--component <key>", "target a component within the version (e.g. sl-glaze)")
    .option("-m, --message <text>", "notes")
    .option("--date <YYYY-MM-DD>", "when you baked/queued it (defaults to now)")
    .action(async (versionId, opts) => {
      if (Boolean(opts.made) === Boolean(opts.toMake)) {
        throw new Error("specify exactly one of --made or --to-make");
      }
      const kind = opts.made ? "made" : "to-make";
      if (opts.rating && kind !== "made") throw new Error("--rating only applies to --made");
      out(await cmd.feedback(makeService(), {
        versionId, kind,
        rating: opts.rating, component: opts.component, notes: opts.message,
        date: opts.date ? new Date(`${opts.date}T12:00:00.000Z`).toISOString() : undefined,
      }));
    });
  feedback.command("list <versionId>")
    .description("show the tasting log for a version's recipe (current verdicts + history)")
    .action(async (versionId) => out(await cmd.feedbackList(makeService(), versionId)));
  feedback.command("rm <id>")
    .description("hard-delete a feedback entry (for genuine mistakes, not superseding)")
    .action(async (id) => { await cmd.feedbackRemove(makeService(), id); out({ removed: id }); });
```

Update the `list` command to accept `--to-make`:

```ts
  program.command("list")
    .description("list all recipes by head version")
    .option("--to-make", "only recipes queued to make (untried experiments)")
    .action(async (opts) => out(await cmd.list(makeService(), { toMake: opts.toMake })));
```

- [ ] **Step 2: Smoke-test against a scratch store**

Run (from repo root):

```bash
export BATCH_DB=/tmp/batch-fb-smoke/db.json
rm -rf /tmp/batch-fb-smoke
V=$(echo '{"name":"Smoke Cookie","yield":{"amount":3,"unit":"cookies"},"content":{"steps":[{"componentKey":"s1","order":1,"instructionText":"bake"}],"slots":[],"usages":[]}}' | ./batch create | jq -r '.version.id')
./batch feedback add "$V" --to-make -m "want to try"
./batch list --to-make | jq -e '.[0].name == "Smoke Cookie" and .[0].queued == true'
./batch feedback add "$V" --made --rating good -m "yum"
./batch feedback add "$V" --made --component s1 --rating bad -m "underbaked"
./batch feedback list "$V" | jq -e '.current.dish.rating == "good" and .current.components.s1.rating == "bad"'
./batch list | jq -e '.[0].tried == true and .[0].verdict == "good" and .[0].queued == false'
unset BATCH_DB
```

Expected: each `jq -e` exits 0 (prints the matched JSON, no error). The second `feedback add` flips `queued` to false (latest entry is now `made`). If any `jq -e` fails (exit 1), the wiring is wrong — fix `cli.ts`.

- [ ] **Step 3: Run the full test suite (nothing regressed)**

Run: `pnpm -r test`
Expected: PASS across both packages.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli.ts
git commit -m "feat(cli): wire feedback verb group + list --to-make"
```

---

## Task 9: Update the batch skill

**Files:**
- Modify: `.claude/skills/batch/SKILL.md`

- [ ] **Step 1: Read the current skill to match its structure**

Run: `sed -n '1,40p' .claude/skills/batch/SKILL.md` and skim for the section style (headers, command-block formatting). Find a logical insertion point (after the composition section, before any "out of scope" footer).

- [ ] **Step 2: Add a "Recording feedback (the tasting log)" section**

Insert a section with this content (adapt heading depth to match the file):

```markdown
## Recording feedback (the tasting log)

Feedback is an **append-only** log beside the recipe — it never edits a recipe or writes a version.
Each entry pins to the exact version you tasted and, optionally, one component.

- **Queue something to make:** `batch feedback add <versionId> --to-make -m "why"`
- **Log an outcome:** `batch feedback add <versionId> --made --rating <bad|okay|good|excellent> -m "notes"`
- **Rate a specific part:** add `--component <key>` (e.g. `--component sl-glaze`) — the dish and a
  weak part get separate verdicts.
- **See the log:** `batch feedback list <versionId>` → current dish verdict, current per-component
  verdicts, then full history.
- **Fix a mistake:** `batch feedback rm <id>` (hard delete — for a wrong-version/dup entry, NOT for
  changing your mind; to change your mind, just `add` a newer entry — the most recent per scope wins).

Rating scale (worst→best): `bad` (major issue) · `okay` (some things need work) · `good` ·
`excellent` (a favorite, shown ★). `list` carries `tried` / `queued` / `verdict` per recipe; an
**experiment** is just a queued, not-yet-`made` variant — `batch list --to-make` is your queue.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/batch/SKILL.md
git commit -m "docs(skill): teach the feedback / tasting-log commands"
```

---

## Task 10: Dogfood — scratch store, then the real `~/.batch` (gated)

**Files:**
- Modify: `~/.batch/sources/reseed.sh`
- Modify: `~/.batch` store (the real data — **requires explicit user go-ahead before mutating**)

- [ ] **Step 1: Dry-run the real verdicts on a scratch reseed**

Reproduce the store fresh and apply the real verdicts to confirm the commands behave on real recipes:

```bash
export BATCH_DB=/tmp/batch-fb-dogfood/db.json
rm -rf /tmp/batch-fb-dogfood
bash ~/.batch/sources/reseed.sh
BATCH=./batch
head() { "$BATCH" list | jq -r --arg n "$1" '.[] | select(.name==$n) | .headVersionId'; }
# Red Velvet — queued (untried)
"$BATCH" feedback add "$(head 'Red Velvet Protein Cookies')" --to-make -m "made the cookie, not the full bake yet"
# the tried-and-good ones
"$BATCH" feedback add "$(head 'Vanilla Pumpkin Protein Cheesecake')" --made --rating good
"$BATCH" feedback add "$(head 'Birthday Cake Protein Cookies')" --made --rating good
"$BATCH" feedback add "$(head 'Browned-Butter Protein Cookies')" --made --rating good
# lemon: good cookie, glaze needs work
LEM=$(head 'Lemon Protein Cookies')
"$BATCH" feedback add "$LEM" --made --rating good -m "cookie itself is great"
# find the glaze component key from the resolved content, then rate it:
"$BATCH" resolve "$LEM" | jq -r '.slots[].componentKey'   # inspect → pick the glaze slot key
unset BATCH_DB
```

Confirm: `batch list` (with `BATCH_DB` set to the scratch store) shows Red Velvet `queued:true`,
the others `verdict:"good"`, and `feedback list "$LEM"` shows dish `good` + the glaze verdict.
Note the exact glaze component key for Step 2 (it is whatever the lemon recipe's glaze slot is named).

- [ ] **Step 2: Add a feedback block to `reseed.sh`**

Append to `~/.batch/sources/reseed.sh` (after the soft-chewy variant block), substituting the real
glaze key found in Step 1 for `<GLAZE_KEY>`:

```bash
# --- Tasting feedback: record the real verdicts so they reproduce. ---
echo "recording tasting feedback..."
head() { "$BATCH" list | jq -r --arg n "$1" '.[] | select(.name==$n) | .headVersionId'; }
"$BATCH" feedback add "$(head 'Red Velvet Protein Cookies')" --to-make -m "made the cookie, not the full bake yet" >/dev/null
"$BATCH" feedback add "$(head 'Vanilla Pumpkin Protein Cheesecake')" --made --rating good >/dev/null
"$BATCH" feedback add "$(head 'Birthday Cake Protein Cookies')" --made --rating good >/dev/null
"$BATCH" feedback add "$(head 'Browned-Butter Protein Cookies')" --made --rating good >/dev/null
LEM=$(head 'Lemon Protein Cookies')
"$BATCH" feedback add "$LEM" --made --rating good -m "cookie itself is great" >/dev/null
"$BATCH" feedback add "$LEM" --made --component <GLAZE_KEY> --rating bad -m "glaze too weak/thin, needs work" >/dev/null
echo "  + feedback recorded"
```

- [ ] **Step 3: Verify reseed reproduces the verdicts in a fresh scratch store**

```bash
export BATCH_DB=/tmp/batch-fb-reseed/db.json
rm -rf /tmp/batch-fb-reseed
bash ~/.batch/sources/reseed.sh
./batch list --to-make | jq -e 'any(.[]; .name == "Red Velvet Protein Cookies")'
./batch list | jq -e 'any(.[]; .name == "Lemon Protein Cookies" and .verdict == "good")'
unset BATCH_DB
```

Expected: both `jq -e` exit 0.

- [ ] **Step 4: STOP — get user go-ahead, then apply to the real store**

This mutates the real `~/.batch` data repo. **Ask the user to confirm** before running. On confirmation:

```bash
# apply the same feedback commands from Step 1 against the real store (default BATCH_DB = ~/.batch/db.json)
# (run them with no BATCH_DB env set), then commit the data repo:
git -C ~/.batch add -A
git -C ~/.batch commit -m "feedback: record tasting verdicts (RV to-make, lemon glaze needs work)"
```

- [ ] **Step 5: Commit the reseed.sh change in the data repo**

(Folded into Step 4's data-repo commit — `reseed.sh` lives under `~/.batch/sources/`. Confirm it is staged by the `git -C ~/.batch add -A`.)

---

## Self-Review

**Spec coverage:**
- DF-1 (own collection, old stores load) → Tasks 2, 5 (+ legacy-store test).
- DF-2 (one journal, two kinds; queue derived) → Task 1 (`summarizeRecipe` queued logic) + Task 7 (`--to-make`).
- DF-3 (4-point scale; excellent=favorite; per-component ratings) → Task 1 (`Rating`), Task 6 (component-scoped made test).
- DF-4 (version-pin + recipe-rollup; derivation isolates) → Task 3 (recipeId from version) + Task 4 (isolation tests).
- DF-5 (recency-supersede; hard rm) → Task 1 (`currentVerdicts` recency) + Tasks 3/6 (rm).
- DF-6 (orthogonal: no version/head/macros) → Task 3 (no-churn assertion).
- CLI surface (feedback add/list/rm, list markers, --to-make) → Tasks 6–8.
- Skill + dogfood → Tasks 9–10.

**Placeholder scan:** the only intentional placeholder is `<GLAZE_KEY>` in Task 10, which Step 1 explicitly instructs the engineer to discover from `batch resolve` first. No other TBDs.

**Type consistency:** `FeedbackEntry`/`FeedbackBase`/`Rating`/`FeedbackKind` defined in Task 1 are imported identically in Tasks 3 (service), 5 (file-repo), 6 (commands). `RecipeFeedbackSummary` (Task 1) is returned by `feedbackSummary` (Task 3) and consumed by `list` (Task 7). `CurrentVerdicts`/`currentVerdicts` (Task 1) exported in Task 1's index edit, imported in Task 6. `addFeedback`'s param shape (Task 3) matches `cmd.feedback`'s call (Task 6: `componentKey: input.component`). The repository quartet names (`saveFeedback`/`getFeedback`/`listFeedback`/`deleteFeedback`) are identical across interface (Task 2), in-memory (Task 2), and file (Task 5).

**Note on `feedbackForRecipe`/`feedbackForVersion`/`feedbackSummary`:** these read methods are implemented in Task 3 (because Task 3's tests call `feedbackForVersion`), and their rollup/isolation behavior is locked by Task 4's tests. This is intentional, not a duplicate.
