# Batch `core` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Milestone 1 of the Batch `core` substrate — an immutable, forkable recipe-versioning engine (create → derive variant → override → resolve → scale) with no macros yet — as a pure, fully-unit-tested TypeScript package.

**Architecture:** A single `packages/core` package of pure domain logic behind a `Repository` interface (in-memory adapter for now; Postgres later). Variants are stored as component-level **override sets** against a base version; every version caches a **materialized `content` snapshot** computed at commit time, so reads are trivial (this is the hybrid model from spec decision D3). All non-determinism (IDs, clock) is injected via a `Deps` object so tests are deterministic.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vitest. No runtime dependencies in `core` for M1.

**Spec:** [`docs/superpowers/specs/2026-06-14-batch-core-design.md`](../specs/2026-06-14-batch-core-design.md) — read §3 (concepts), §5 (decisions), §6 (entities), §7 (operations) before starting.

---

## Scope: what M1 covers

This plan is **Milestone 1 of 5** for `core`. It is a self-contained, working, testable slice: the version/variant substrate **without** macros, units, composition, rebase, or extract-base. Those are later milestones (see *Roadmap* at the end), each getting its own plan once M1 lands and informs them.

**Use cases delivered by M1:** `UC1` (create), `UC3` (edit → new version), `UC4` (resolve), `UC5` (scale), `UC6` (history), `UC7` (derive variant), `UC8` (override, component-level), `UC9` (resolve variant), `UC21` (status), `UC22` (author + commit message), `UC24` (tags), `UC26` (yield).

**Explicitly deferred to later milestones:** macros/units (`UC16–19, 27`), composition/sub-recipes (`UC13–15`), rebase (`UC11`), staleness (`UC12`), extract-base (`UC10`), diff (`UC20`), library (`UC16`), annotations (`UC23`), USDA (`UC17`).

---

## File structure

```
batch/
  package.json                      # workspace root (private)
  pnpm-workspace.yaml
  tsconfig.base.json
  packages/
    core/
      package.json
      tsconfig.json
      vitest.config.ts
      src/
        types.ts                    # all domain types (entities + override set)
        deps.ts                     # Deps (injected id + clock); test + prod factories
        repository.ts               # Repository interface
        in-memory-repository.ts     # Map-backed adapter
        materialize.ts              # pure: apply an override set onto base content
        scale.ts                    # pure: scale quantities to a serving count
        recipe-service.ts           # create / derive / override / edit / resolve / history
        index.ts                    # public surface (re-exports)
      test/
        materialize.test.ts
        scale.test.ts
        recipe-service.test.ts
```

Each `src` file has one responsibility. `materialize.ts` and `scale.ts` are pure functions (no I/O) and carry the densest tests; `recipe-service.ts` orchestrates them over the `Repository`.

---

## Task 1: Scaffold the monorepo + toolchain

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Test: `packages/core/test/smoke.test.ts`

- [ ] **Step 1: Create workspace root files**

`package.json`:
```json
{
  "name": "batch",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: Create `packages/core` config**

`packages/core/package.json`:
```json
{
  "name": "@batch/core",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src", "test"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 3: Write the smoke test**

`packages/core/test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm -C packages/core test`
Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(core): scaffold monorepo, typescript, vitest"
```

---

## Task 2: Domain types

**Files:**
- Create: `packages/core/src/types.ts`
- Test: (type-only; verified by `typecheck` and used in later tests)

- [ ] **Step 1: Write the types**

`packages/core/src/types.ts`:
```ts
export type RecipeId = string;
export type VersionId = string;
export type ComponentKey = string;

export type Author = "user" | "agent" | "system";
export type VersionStatus = "draft" | "approved" | "rejected";

export interface Yield {
  amount: number;
  unit: string; // e.g. "squares", "g", "servings"
}

export interface Step {
  componentKey: ComponentKey;
  order: number;
  instructionText: string;
  section?: string;
  timerSeconds?: number;
  temperature?: number;
}

export type SlotResolution =
  | { kind: "raw"; libraryIngredientId: string }
  | { kind: "sub_recipe"; subRecipeVersionId: VersionId };

export interface IngredientSlot {
  componentKey: ComponentKey;
  name: string;
  prepDefault?: string;
  resolution: SlotResolution;
}

export interface StepUsage {
  componentKey: ComponentKey;
  stepKey: ComponentKey;
  slotKey: ComponentKey;
  quantityValue: number;
  quantityUnit: string;
  prepState?: string;
}

export interface RecipeContent {
  steps: Step[];
  slots: IngredientSlot[];
  usages: StepUsage[];
}

export type ComponentKind = "step" | "slot" | "usage";

export type OverrideEntry =
  | { op: "remove"; kind: ComponentKind; target: ComponentKey }
  | { op: "replace"; kind: "step"; target: ComponentKey; payload: Step }
  | { op: "replace"; kind: "slot"; target: ComponentKey; payload: IngredientSlot }
  | { op: "replace"; kind: "usage"; target: ComponentKey; payload: StepUsage }
  | { op: "add"; kind: "step"; payload: Step }
  | { op: "add"; kind: "slot"; payload: IngredientSlot }
  | { op: "add"; kind: "usage"; payload: StepUsage };

export interface OverrideSet {
  entries: OverrideEntry[];
  name?: string;
  yield?: Yield;
  tags?: string[];
}

export interface RecipeVersion {
  id: VersionId;
  recipeId: RecipeId;
  prevVersionId?: VersionId; // history edge
  derivesFromVersionId?: VersionId; // inheritance edge; absent => root
  name: string;
  description?: string;
  tags: string[];
  yield: Yield;
  status: VersionStatus;
  author: Author;
  commitMessage: string;
  overrideSet?: OverrideSet; // present iff variant
  content: RecipeContent; // materialized snapshot, always present
  createdAt: string; // ISO-8601
}

export interface Recipe {
  id: RecipeId;
  createdBy: Author;
  createdAt: string;
  headVersionId: VersionId;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C packages/core typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): domain types for recipes, versions, override sets"
```

---

## Task 3: Deps + Repository interface + in-memory adapter

**Files:**
- Create: `packages/core/src/deps.ts`, `packages/core/src/repository.ts`, `packages/core/src/in-memory-repository.ts`
- Test: `packages/core/test/recipe-service.test.ts` (shared test helpers added here)

- [ ] **Step 1: Write `deps.ts`**

`packages/core/src/deps.ts`:
```ts
export interface Deps {
  newId(): string;
  now(): string;
}

// Production: random ids + wall clock.
export function realDeps(): Deps {
  return {
    newId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  };
}

// Tests: deterministic incrementing ids + fixed clock.
export function testDeps(): Deps {
  let n = 0;
  return {
    newId: () => `id${++n}`,
    now: () => "2026-01-01T00:00:00.000Z",
  };
}
```

- [ ] **Step 2: Write `repository.ts`**

`packages/core/src/repository.ts`:
```ts
import type { Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";

export interface Repository {
  saveRecipe(recipe: Recipe): Promise<void>;
  getRecipe(id: RecipeId): Promise<Recipe | undefined>;
  saveVersion(version: RecipeVersion): Promise<void>;
  getVersion(id: VersionId): Promise<RecipeVersion | undefined>;
  setHead(recipeId: RecipeId, versionId: VersionId): Promise<void>;
}
```

- [ ] **Step 3: Write the failing test for the in-memory adapter**

`packages/core/test/recipe-service.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../src/in-memory-repository.js";
import type { Recipe } from "../src/types.js";

describe("InMemoryRepository", () => {
  it("stores and retrieves a recipe and updates head", async () => {
    const repo = new InMemoryRepository();
    const recipe: Recipe = {
      id: "r1",
      createdBy: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      headVersionId: "v1",
    };
    await repo.saveRecipe(recipe);
    await repo.setHead("r1", "v2");
    const got = await repo.getRecipe("r1");
    expect(got?.headVersionId).toBe("v2");
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm -C packages/core test recipe-service`
Expected: FAIL — cannot find `../src/in-memory-repository.js`.

- [ ] **Step 5: Implement the adapter**

`packages/core/src/in-memory-repository.ts`:
```ts
import type { Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";
import type { Repository } from "./repository.js";

export class InMemoryRepository implements Repository {
  private recipes = new Map<RecipeId, Recipe>();
  private versions = new Map<VersionId, RecipeVersion>();

  async saveRecipe(recipe: Recipe): Promise<void> {
    this.recipes.set(recipe.id, structuredClone(recipe));
  }
  async getRecipe(id: RecipeId): Promise<Recipe | undefined> {
    const r = this.recipes.get(id);
    return r ? structuredClone(r) : undefined;
  }
  async saveVersion(version: RecipeVersion): Promise<void> {
    this.versions.set(version.id, structuredClone(version));
  }
  async getVersion(id: VersionId): Promise<RecipeVersion | undefined> {
    const v = this.versions.get(id);
    return v ? structuredClone(v) : undefined;
  }
  async setHead(recipeId: RecipeId, versionId: VersionId): Promise<void> {
    const r = this.recipes.get(recipeId);
    if (!r) throw new Error(`recipe not found: ${recipeId}`);
    r.headVersionId = versionId;
  }
}
```

(`structuredClone` keeps stored objects isolated from callers — the adapter behaves like a real DB that returns copies.)

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm -C packages/core test recipe-service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/deps.ts packages/core/src/repository.ts packages/core/src/in-memory-repository.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): Deps, Repository interface, in-memory adapter"
```

---

## Task 4: `materialize()` — apply an override set onto base content (pure)

This is the heart of the variant model (spec §7, D5 component-level). It takes a base `RecipeContent` and an `OverrideSet`, and returns new content with `remove`/`replace`/`add` applied by `componentKey`. It must not mutate its inputs.

**Files:**
- Create: `packages/core/src/materialize.ts`
- Test: `packages/core/test/materialize.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/materialize.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core test materialize`
Expected: FAIL — cannot find `../src/materialize.js`.

- [ ] **Step 3: Implement `materialize`**

`packages/core/src/materialize.ts`:
```ts
import type {
  ComponentKind, IngredientSlot, OverrideEntry, OverrideSet,
  RecipeContent, Step, StepUsage,
} from "./types.js";

function arrayFor(content: RecipeContent, kind: ComponentKind): Array<{ componentKey: string }> {
  switch (kind) {
    case "step": return content.steps as Array<{ componentKey: string }>;
    case "slot": return content.slots as Array<{ componentKey: string }>;
    case "usage": return content.usages as Array<{ componentKey: string }>;
  }
}

function applyEntry(content: RecipeContent, entry: OverrideEntry): void {
  const arr = arrayFor(content, entry.kind);
  if (entry.op === "add") {
    arr.push(entry.payload as Step & IngredientSlot & StepUsage);
    return;
  }
  const idx = arr.findIndex((c) => c.componentKey === entry.target);
  if (idx === -1) {
    throw new Error(`override target not found: ${entry.kind} ${entry.target}`);
  }
  if (entry.op === "remove") {
    arr.splice(idx, 1);
  } else {
    arr[idx] = entry.payload as Step & IngredientSlot & StepUsage;
  }
}

export function materialize(base: RecipeContent, overrides: OverrideSet): RecipeContent {
  const out: RecipeContent = structuredClone(base);
  for (const entry of overrides.entries) applyEntry(out, entry);
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/core test materialize`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/materialize.ts packages/core/test/materialize.test.ts
git commit -m "feat(core): materialize override sets onto base content"
```

---

## Task 5: `RecipeService.createRecipe()` + `getVersion()` + `resolve()`

**Files:**
- Create: `packages/core/src/recipe-service.ts`
- Modify: `packages/core/test/recipe-service.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `packages/core/test/recipe-service.test.ts`:
```ts
import { RecipeService } from "../src/recipe-service.js";
import { testDeps } from "../src/deps.js";
import type { RecipeContent } from "../src/types.js";

function content(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "Mix and bake", temperature: 350 }],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}

function makeService() {
  return new RecipeService(new InMemoryRepository(), testDeps());
}

describe("createRecipe", () => {
  it("creates a root recipe + first version and points head at it", async () => {
    const svc = makeService();
    const { recipe, version } = await svc.createRecipe({
      name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    expect(recipe.headVersionId).toBe(version.id);
    expect(version.derivesFromVersionId).toBeUndefined();
    expect(version.status).toBe("draft");
    expect(version.author).toBe("user");
    expect(await svc.resolve(version.id)).toEqual(content());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core test recipe-service`
Expected: FAIL — cannot find `../src/recipe-service.js`.

- [ ] **Step 3: Implement the service skeleton + `createRecipe`/`getVersion`/`resolve`**

`packages/core/src/recipe-service.ts`:
```ts
import type {
  Author, Recipe, RecipeContent, RecipeVersion, VersionId, Yield,
} from "./types.js";
import type { Repository } from "./repository.js";
import type { Deps } from "./deps.js";

export class RecipeService {
  constructor(private repo: Repository, private deps: Deps) {}

  async getVersion(id: VersionId): Promise<RecipeVersion> {
    const v = await this.repo.getVersion(id);
    if (!v) throw new Error(`version not found: ${id}`);
    return v;
  }

  async resolve(id: VersionId): Promise<RecipeContent> {
    return (await this.getVersion(id)).content;
  }

  async createRecipe(input: {
    name: string;
    description?: string;
    tags?: string[];
    yield: Yield;
    content: RecipeContent;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ recipe: Recipe; version: RecipeVersion }> {
    const recipeId = this.deps.newId();
    const versionId = this.deps.newId();
    const now = this.deps.now();
    const author = input.author ?? "user";

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
      content: structuredClone(input.content),
      createdAt: now,
    };
    const recipe: Recipe = { id: recipeId, createdBy: author, createdAt: now, headVersionId: versionId };

    await this.repo.saveRecipe(recipe);
    await this.repo.saveVersion(version);
    return { recipe, version };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/core test recipe-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): createRecipe, getVersion, resolve"
```

---

## Task 6: `deriveVariant()` — fork a variant off a base version

**Files:**
- Modify: `packages/core/src/recipe-service.ts`
- Modify: `packages/core/test/recipe-service.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `recipe-service.test.ts`:
```ts
describe("deriveVariant", () => {
  it("creates a new recipe whose first version derives from the base and resolves identically", async () => {
    const svc = makeService();
    const { version: base } = await svc.createRecipe({
      name: "Cheesecake Base", yield: { amount: 12, unit: "slices" }, content: content(),
    });
    const { recipe: variantRecipe, version: variant } = await svc.deriveVariant({
      baseVersionId: base.id, name: "Banana Cheesecake",
    });
    expect(variant.derivesFromVersionId).toBe(base.id);
    expect(variant.recipeId).toBe(variantRecipe.id);
    expect(variant.recipeId).not.toBe(base.recipeId);
    expect(variant.name).toBe("Banana Cheesecake");
    expect(variant.overrideSet).toEqual({ entries: [], name: "Banana Cheesecake" });
    // empty overrides => content identical to base
    expect(await svc.resolve(variant.id)).toEqual(content());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core test recipe-service`
Expected: FAIL — `deriveVariant` is not a function.

- [ ] **Step 3: Implement `deriveVariant`**

Add to `RecipeService` in `recipe-service.ts` (and add `materialize` import at top: `import { materialize } from "./materialize.js";` plus `OverrideSet` to the type import):
```ts
  async deriveVariant(input: {
    baseVersionId: VersionId;
    name: string;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ recipe: Recipe; version: RecipeVersion }> {
    const base = await this.getVersion(input.baseVersionId);
    const recipeId = this.deps.newId();
    const versionId = this.deps.newId();
    const now = this.deps.now();
    const author = input.author ?? "user";

    const overrideSet: OverrideSet = { entries: [], name: input.name };
    const version: RecipeVersion = {
      id: versionId,
      recipeId,
      derivesFromVersionId: base.id,
      name: input.name,
      tags: [],
      yield: base.yield,
      status: "draft",
      author,
      commitMessage: input.commitMessage ?? `derive variant from ${base.name}`,
      overrideSet,
      content: materialize(base.content, overrideSet),
      createdAt: now,
    };
    const recipe: Recipe = { id: recipeId, createdBy: author, createdAt: now, headVersionId: versionId };
    await this.repo.saveRecipe(recipe);
    await this.repo.saveVersion(version);
    return { recipe, version };
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/core test recipe-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): deriveVariant"
```

---

## Task 7: `applyOverride()` — add a component-level override, re-materialize

This proves the snapshot+inheritance reconciliation (spec D1/D3): overriding the variant pins that component, but it still inherits everything else from the base, and each change is a new immutable version on the history edge.

**Files:**
- Modify: `packages/core/src/recipe-service.ts`
- Modify: `packages/core/test/recipe-service.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `recipe-service.test.ts`:
```ts
describe("applyOverride", () => {
  it("pins the overridden component but inherits the rest, as a new version", async () => {
    const svc = makeService();
    const { version: base } = await svc.createRecipe({
      name: "Base", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    const { version: variant } = await svc.deriveVariant({ baseVersionId: base.id, name: "Low-sugar" });

    const { version: v2 } = await svc.applyOverride({
      versionId: variant.id,
      entry: { op: "replace", kind: "usage", target: "u1",
        payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } },
      commitMessage: "cut sugar 200g -> 120g",
    });

    expect(v2.prevVersionId).toBe(variant.id); // history edge
    expect(v2.derivesFromVersionId).toBe(base.id); // still derives from base
    const resolved = await svc.resolve(v2.id);
    expect(resolved.usages[0]?.quantityValue).toBe(120); // overridden
    expect(resolved.steps[0]?.instructionText).toBe("Mix and bake"); // inherited
  });

  it("throws when applying an override to a non-variant (root) version", async () => {
    const svc = makeService();
    const { version: root } = await svc.createRecipe({
      name: "Root", yield: { amount: 1, unit: "loaf" }, content: content(),
    });
    await expect(
      svc.applyOverride({
        versionId: root.id,
        entry: { op: "remove", kind: "step", target: "s1" },
      }),
    ).rejects.toThrow(/not a variant/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core test recipe-service`
Expected: FAIL — `applyOverride` is not a function.

- [ ] **Step 3: Implement `applyOverride`**

Add to `RecipeService` (add `OverrideEntry` to the type import):
```ts
  async applyOverride(input: {
    versionId: VersionId;
    entry: OverrideEntry;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ version: RecipeVersion }> {
    const current = await this.getVersion(input.versionId);
    if (!current.overrideSet || !current.derivesFromVersionId) {
      throw new Error(`version ${current.id} is not a variant`);
    }
    const base = await this.getVersion(current.derivesFromVersionId);
    const overrideSet: OverrideSet = {
      ...current.overrideSet,
      entries: [...current.overrideSet.entries, input.entry],
    };
    const version: RecipeVersion = {
      ...current,
      id: this.deps.newId(),
      prevVersionId: current.id,
      overrideSet,
      content: materialize(base.content, overrideSet),
      author: input.author ?? current.author,
      commitMessage: input.commitMessage ?? "apply override",
      status: "draft",
      createdAt: this.deps.now(),
    };
    await this.repo.saveVersion(version);
    await this.repo.setHead(version.recipeId, version.id);
    return { version };
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/core test recipe-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): applyOverride with re-materialization"
```

---

## Task 8: `editMetadata()` + `getHistory()`

`editMetadata` creates a new version with changed version-level fields (name/description/tags/yield/status) — content unchanged — demonstrating immutable edits and status transitions (`UC3, UC21, UC24, UC26`). For variants it mirrors name/tags/yield into the override set so the intent survives future rebases. `getHistory` walks the `prevVersionId` chain (`UC6`).

**Files:**
- Modify: `packages/core/src/recipe-service.ts`
- Modify: `packages/core/test/recipe-service.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `recipe-service.test.ts`:
```ts
describe("editMetadata + getHistory", () => {
  it("creates a new version with updated metadata, content unchanged", async () => {
    const svc = makeService();
    const { version: v1 } = await svc.createRecipe({
      name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content(),
    });
    const { version: v2 } = await svc.editMetadata({
      versionId: v1.id, patch: { name: "Fudgy Brownies", status: "approved", tags: ["dessert", "brownie"] },
    });
    expect(v2.prevVersionId).toBe(v1.id);
    expect(v2.name).toBe("Fudgy Brownies");
    expect(v2.status).toBe("approved");
    expect(v2.tags).toEqual(["dessert", "brownie"]);
    expect(v2.content).toEqual(v1.content);
  });

  it("walks the history chain newest-first", async () => {
    const svc = makeService();
    const { version: v1 } = await svc.createRecipe({
      name: "A", yield: { amount: 1, unit: "x" }, content: content(),
    });
    const { version: v2 } = await svc.editMetadata({ versionId: v1.id, patch: { name: "B" } });
    const { version: v3 } = await svc.editMetadata({ versionId: v2.id, patch: { name: "C" } });
    const history = await svc.getHistory(v3.id);
    expect(history.map((v) => v.name)).toEqual(["C", "B", "A"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core test recipe-service`
Expected: FAIL — `editMetadata` is not a function.

- [ ] **Step 3: Implement `editMetadata` + `getHistory`**

Add to `RecipeService` (add `VersionStatus`, `Yield` already imported):
```ts
  async editMetadata(input: {
    versionId: VersionId;
    patch: { name?: string; description?: string; tags?: string[]; yield?: Yield; status?: VersionStatus };
    author?: Author;
    commitMessage?: string;
  }): Promise<{ version: RecipeVersion }> {
    const current = await this.getVersion(input.versionId);
    const p = input.patch;
    const overrideSet = current.overrideSet
      ? {
          ...current.overrideSet,
          ...(p.name !== undefined ? { name: p.name } : {}),
          ...(p.yield !== undefined ? { yield: p.yield } : {}),
          ...(p.tags !== undefined ? { tags: p.tags } : {}),
        }
      : current.overrideSet;
    const version: RecipeVersion = {
      ...current,
      id: this.deps.newId(),
      prevVersionId: current.id,
      name: p.name ?? current.name,
      description: p.description ?? current.description,
      tags: p.tags ?? current.tags,
      yield: p.yield ?? current.yield,
      status: p.status ?? current.status,
      overrideSet,
      author: input.author ?? current.author,
      commitMessage: input.commitMessage ?? "edit metadata",
      createdAt: this.deps.now(),
    };
    await this.repo.saveVersion(version);
    await this.repo.setHead(version.recipeId, version.id);
    return { version };
  }

  async getHistory(versionId: VersionId): Promise<RecipeVersion[]> {
    const out: RecipeVersion[] = [];
    let cursor: VersionId | undefined = versionId;
    while (cursor) {
      const v: RecipeVersion = await this.getVersion(cursor);
      out.push(v);
      cursor = v.prevVersionId;
    }
    return out;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/core test recipe-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): editMetadata and getHistory"
```

---

## Task 9: `scale()` — scale quantities to a serving count (pure)

Scaling multiplies every usage's `quantityValue` by `target / yield.amount`. It is unit-preserving (no unit conversion — that arrives with macros in M2) and does **not** touch step times (spec D13: bake time is non-linear).

**Files:**
- Create: `packages/core/src/scale.ts`
- Test: `packages/core/test/scale.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/scale.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scale } from "../src/scale.js";
import type { RecipeContent, Yield } from "../src/types.js";

function content(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "Bake", timerSeconds: 1500 }],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}
const y: Yield = { amount: 16, unit: "squares" };

describe("scale", () => {
  it("halves quantities for a half batch", () => {
    const out = scale(content(), y, 8);
    expect(out.usages[0]?.quantityValue).toBe(100);
    expect(out.usages[0]?.quantityUnit).toBe("g"); // unit preserved
  });

  it("does not change step timers", () => {
    const out = scale(content(), y, 8);
    expect(out.steps[0]?.timerSeconds).toBe(1500);
  });

  it("does not mutate input and rejects non-positive yield", () => {
    const c = content();
    scale(c, y, 32);
    expect(c.usages[0]?.quantityValue).toBe(200);
    expect(() => scale(content(), { amount: 0, unit: "x" }, 8)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core test scale`
Expected: FAIL — cannot find `../src/scale.js`.

- [ ] **Step 3: Implement `scale`**

`packages/core/src/scale.ts`:
```ts
import type { RecipeContent, Yield } from "./types.js";

export function scale(content: RecipeContent, from: Yield, targetServings: number): RecipeContent {
  if (from.amount <= 0) throw new Error("yield amount must be positive");
  const factor = targetServings / from.amount;
  const out = structuredClone(content);
  for (const u of out.usages) u.quantityValue = u.quantityValue * factor;
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/core test scale`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the public surface and commit**

`packages/core/src/index.ts`:
```ts
export * from "./types.js";
export * from "./deps.js";
export * from "./repository.js";
export { InMemoryRepository } from "./in-memory-repository.js";
export { materialize } from "./materialize.js";
export { scale } from "./scale.js";
export { RecipeService } from "./recipe-service.js";
```

Run: `pnpm -C packages/core test && pnpm -C packages/core typecheck`
Expected: all tests pass, no type errors.

```bash
git add packages/core/src/scale.ts packages/core/test/scale.test.ts packages/core/src/index.ts
git commit -m "feat(core): scale + public index"
```

---

## Self-review (completed during planning)

- **Spec coverage (M1 scope):** every M1 use case maps to a task — `UC1`→T5, `UC3`→T8, `UC4/9`→T4+T5+T7, `UC5`→T9, `UC6`→T8, `UC7`→T6, `UC8`→T7, `UC21/22`→T5/T8, `UC24/26`→T5/T8. Deferred UCs are explicitly listed in *Scope* and *Roadmap*, not silently dropped.
- **Type consistency:** method names and shapes are stable across tasks — `materialize(base, overrides)`, `RecipeService.{createRecipe, getVersion, resolve, deriveVariant, applyOverride, editMetadata, getHistory}`, `Repository.{saveRecipe, getRecipe, saveVersion, getVersion, setHead}`, `Deps.{newId, now}`. `componentKey` is the join key everywhere.
- **No placeholders:** every code step contains complete, runnable code; every run step has an exact command + expected result.

---

## Roadmap — the remaining `core` milestones

Each becomes its own spec-aligned plan **after** the prior milestone lands (so real types inform the next). M1 is the spine; the rest hang off it.

- **M2 — Macros & units.** `library_ingredient` CRUD; the universal conversion table + per-ingredient density (`UC27`); `computeMacros` for raw ingredients with per-serving via `yield`; snapshot onto the version (`UC18/19/26`); the resolution ladder with partial results (`UC17`); `diff` of two versions incl. macro delta (`UC20`).
- **M3 — Composition.** `slot_resolution.kind = sub_recipe`; cycle-safety (`UC15`); macro recursion through sub-recipes; `staleness` for pinned sub-recipe versions (`UC12`, composition side).
- **M4 — Advanced version ops.** `rebase` as a component-level 3-way merge with conflict surfacing (`UC11`); `staleness` for the derivation edge; `extract_base` with the `resolve(new) == resolve(old)` invariant (`UC10`); the `annotation` layer (`UC23`).
- **M5 — Surfaces.** The `batch` CLI over `core` + the Claude `SKILL.md` wrapping it (sub-project #2). After this, the full loop is dogfoodable headlessly in Claude Code. A Postgres `Repository` adapter replaces in-memory for persistence.

---

## Execution handoff

When ready to implement, two options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in-session with checkpoints. Uses `superpowers:executing-plans`.
