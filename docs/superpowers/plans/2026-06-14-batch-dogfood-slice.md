# Batch Dogfood Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the M1 `core` substrate *dogfoodable* — add real on-disk persistence, a scriptable `batch` CLI, and a Claude skill — so recipes can be moved out of Recipe Notes and a real tree of bases + variants can be built conversationally.

**Architecture:** Three additions on top of `@batch/core` (M1): (1) a tiny extension to the `Repository` interface for enumeration; (2) a new `@batch/cli` package containing a `FileRepository` (single JSON file, atomic writes) that implements `Repository`, a set of pure command functions over `RecipeService`, and a thin `commander` wiring layer exposing a `batch` binary; (3) a project-level Claude skill (`.claude/skills/batch/SKILL.md`) that teaches the agent to operate the CLI. `core` stays pure (no `fs`); all I/O lives in the CLI package.

**Tech Stack:** TypeScript (strict, ESM), pnpm workspaces, Vitest, `commander` (CLI parsing), `tsx` (run TS with no build step), Node `fs`/`path`/`os`.

**Builds on:** [`2026-06-14-batch-core.md`](./2026-06-14-batch-core.md) (M1, done). This is sub-project #2 ("CLI + skill") plus a file-storage adapter, delivering a usable vertical slice ahead of the full M2–M5 roadmap. Macros (M2) are intentionally NOT here — the tree (bases/variants/overrides) is the value to dogfood first; macros layer on later and compute over the existing tree.

---

## Key design decisions (rationale-forward)

- **D-A — Single JSON file + atomic write, not SQLite/Postgres (yet).** A personal recipe collection is dozens–hundreds of versions. A single `db.json` (`{recipes:{}, versions:{}}`) loaded per process is trivially fast, human-readable, diffable, and git-versionable (literally "git for recipes"). Writes are atomic: write `db.json.tmp` then `rename` over `db.json`, so a crash never corrupts the store. Postgres becomes a different `Repository` adapter when the web app arrives — no core change.
- **D-B — `FileRepository` in `@batch/cli`, not in `core`.** `core` deliberately has zero runtime deps and no I/O so it stays portable and pure-testable. The `Repository` interface is the seam; storage adapters live with their consumers. Today the only consumer of file storage is the CLI.
- **D-C — Enumeration added to `Repository`.** Showing the tree needs "list all recipes / all versions." That is a legitimate repository capability, so it goes in the interface (`listRecipes`, `listVersions`) and every adapter implements it — rather than reaching past the abstraction.
- **D-D — CLI is JSON-in / JSON-out.** The primary driver is the Claude skill; the agent authors recipe JSON from an Instagram caption and parses command output. Stable machine contracts beat pretty tables. The agent renders results nicely in chat; a human-friendly TUI is later polish.
- **D-E — Command logic separated from CLI wiring.** `commands.ts` holds pure `async (svc, args) => result` functions, unit-tested against an `InMemoryRepository` + `testDeps` (fast, deterministic, no fs/process). `cli.ts` is the thin `commander` layer (argv → stdin → construct `FileRepository`+`RecipeService` → call command → print JSON). Thin glue, tested by one smoke test.
- **D-F — `tsx`, no build step.** During active dogfooding we want edits to take effect instantly. A `./batch` shim runs `tsx packages/cli/src/bin.ts`. A compiled `dist/` build can come later for distribution.
- **D-G — Skill over MCP.** The CLI is the real interface; the skill is a thin token-efficient wrapper documenting the model + commands. MCP stays an optional later adapter.

---

## File structure

```
batch/
  batch                              # NEW: executable shim -> tsx packages/cli/src/bin.ts
  package.json                       # MODIFY: add tsx devDep at workspace root
  packages/
    core/
      src/
        repository.ts                # MODIFY: + listRecipes(), listVersions()
        in-memory-repository.ts      # MODIFY: implement the two
        recipe-service.ts            # MODIFY: + listRecipes(), listVersions(), getRecipe() passthroughs
      test/
        recipe-service.test.ts       # MODIFY: + enumeration tests
    cli/                             # NEW package @batch/cli
      package.json
      tsconfig.json
      vitest.config.ts
      src/
        file-repository.ts           # Repository over a single JSON file, atomic writes
        db-path.ts                   # resolve $BATCH_DB or ~/.batch/db.json
        commands.ts                  # pure command functions over RecipeService
        cli.ts                       # commander wiring (argv, stdin, JSON out)
        bin.ts                       # shebang entrypoint
      test/
        file-repository.test.ts
        commands.test.ts
  .claude/
    skills/
      batch/
        SKILL.md                     # NEW: agent operating guide for the batch CLI
```

---

## Task 1: Extend `Repository` + `RecipeService` with enumeration

**Files:**
- Modify: `packages/core/src/repository.ts`, `packages/core/src/in-memory-repository.ts`, `packages/core/src/recipe-service.ts`
- Modify (test): `packages/core/test/recipe-service.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `packages/core/test/recipe-service.test.ts`:
```ts
describe("enumeration", () => {
  it("lists recipes and versions, and getRecipe returns the recipe", async () => {
    const svc = makeService();
    const { recipe: r1, version: v1 } = await svc.createRecipe({
      name: "Base", yield: { amount: 12, unit: "slices" }, content: content(),
    });
    await svc.deriveVariant({ baseVersionId: v1.id, name: "Variant" });
    const recipes = await svc.listRecipes();
    const versions = await svc.listVersions();
    expect(recipes).toHaveLength(2);
    expect(versions).toHaveLength(2);
    expect((await svc.getRecipe(r1.id)).id).toBe(r1.id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core test recipe-service`
Expected: FAIL — `svc.listRecipes is not a function`.

- [ ] **Step 3: Extend the interface**

`packages/core/src/repository.ts` — add two methods to the interface:
```ts
import type { Recipe, RecipeId, RecipeVersion, VersionId } from "./types.js";

export interface Repository {
  saveRecipe(recipe: Recipe): Promise<void>;
  getRecipe(id: RecipeId): Promise<Recipe | undefined>;
  saveVersion(version: RecipeVersion): Promise<void>;
  getVersion(id: VersionId): Promise<RecipeVersion | undefined>;
  setHead(recipeId: RecipeId, versionId: VersionId): Promise<void>;
  listRecipes(): Promise<Recipe[]>;
  listVersions(): Promise<RecipeVersion[]>;
}
```

- [ ] **Step 4: Implement in the in-memory adapter**

Add to `InMemoryRepository` in `packages/core/src/in-memory-repository.ts`:
```ts
  async listRecipes(): Promise<Recipe[]> {
    return [...this.recipes.values()].map((r) => structuredClone(r));
  }
  async listVersions(): Promise<RecipeVersion[]> {
    return [...this.versions.values()].map((v) => structuredClone(v));
  }
```

- [ ] **Step 5: Add service passthroughs**

Add to `RecipeService` in `packages/core/src/recipe-service.ts` (import `RecipeId` in the type import):
```ts
  async listRecipes(): Promise<Recipe[]> {
    return this.repo.listRecipes();
  }
  async listVersions(): Promise<RecipeVersion[]> {
    return this.repo.listVersions();
  }
  async getRecipe(id: RecipeId): Promise<Recipe> {
    const r = await this.repo.getRecipe(id);
    if (!r) throw new Error(`recipe not found: ${id}`);
    return r;
  }
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm -C packages/core test recipe-service && pnpm -C packages/core typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/repository.ts packages/core/src/in-memory-repository.ts packages/core/src/recipe-service.ts packages/core/test/recipe-service.test.ts
git commit -m "feat(core): repository + service enumeration (listRecipes, listVersions, getRecipe)"
```

---

## Task 2: Scaffold the `@batch/cli` package

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/vitest.config.ts`
- Modify: root `package.json` (add `tsx` devDep)

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "@batch/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "batch": "src/bin.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@batch/core": "workspace:*",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "types": ["node"] },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `packages/cli/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 4: Add `tsx` at the workspace root**

Modify root `package.json` to add a `devDependencies` block (keep existing fields):
```json
{
  "name": "batch",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 5: Install**

Run: `pnpm install`
Expected: installs `commander`, `tsx`, `@types/node`; links `@batch/core` into `@batch/cli`. No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore(cli): scaffold @batch/cli package + tsx"
```

---

## Task 3: `FileRepository` — Repository over a single JSON file

**Files:**
- Create: `packages/cli/src/db-path.ts`, `packages/cli/src/file-repository.ts`
- Test: `packages/cli/test/file-repository.test.ts`

- [ ] **Step 1: Write `db-path.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the store path: $BATCH_DB if set, else ~/.batch/db.json. */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.BATCH_DB ?? join(homedir(), ".batch", "db.json");
}
```

- [ ] **Step 2: Write the failing tests**

`packages/cli/test/file-repository.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { FileRepository } from "../src/file-repository.js";
import type { Recipe, RecipeVersion } from "@batch/core";

const DIR = join(process.cwd(), ".test-tmp");
const DB = join(DIR, "db.json");

function recipe(id: string, head: string): Recipe {
  return { id, createdBy: "user", createdAt: "2026-01-01T00:00:00.000Z", headVersionId: head };
}
function version(id: string, recipeId: string): RecipeVersion {
  return {
    id, recipeId, name: "R", tags: [], yield: { amount: 1, unit: "x" },
    status: "draft", author: "user", commitMessage: "c",
    content: { steps: [], slots: [], usages: [] }, createdAt: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(async () => { await fs.rm(DIR, { recursive: true, force: true }); });
afterEach(async () => { await fs.rm(DIR, { recursive: true, force: true }); });

describe("FileRepository", () => {
  it("returns undefined / empty lists when the store does not exist", async () => {
    const repo = new FileRepository(DB);
    expect(await repo.getRecipe("nope")).toBeUndefined();
    expect(await repo.listRecipes()).toEqual([]);
  });

  it("persists across instances and writes pretty JSON to disk", async () => {
    const a = new FileRepository(DB);
    await a.saveRecipe(recipe("r1", "v1"));
    await a.saveVersion(version("v1", "r1"));
    // a fresh instance reads what was written
    const b = new FileRepository(DB);
    expect((await b.getRecipe("r1"))?.headVersionId).toBe("v1");
    expect(await b.listVersions()).toHaveLength(1);
    const raw = await fs.readFile(DB, "utf8");
    expect(raw).toContain("\n"); // pretty-printed
    expect(JSON.parse(raw).recipes.r1.id).toBe("r1");
  });

  it("setHead updates and persists", async () => {
    const repo = new FileRepository(DB);
    await repo.saveRecipe(recipe("r1", "v1"));
    await repo.setHead("r1", "v2");
    expect((await new FileRepository(DB).getRecipe("r1"))?.headVersionId).toBe("v2");
  });

  it("returns copies, not internal references", async () => {
    const repo = new FileRepository(DB);
    await repo.saveRecipe(recipe("r1", "v1"));
    const got = await repo.getRecipe("r1");
    got!.headVersionId = "MUTATED";
    expect((await repo.getRecipe("r1"))?.headVersionId).toBe("v1");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm -C packages/cli test file-repository`
Expected: FAIL — cannot find `../src/file-repository.js`.

- [ ] **Step 4: Implement `FileRepository`**

`packages/cli/src/file-repository.ts`:
```ts
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type {
  Recipe, RecipeId, RecipeVersion, VersionId, Repository,
} from "@batch/core";

interface Db {
  recipes: Record<string, Recipe>;
  versions: Record<string, RecipeVersion>;
}

export class FileRepository implements Repository {
  private data: Db | null = null;

  constructor(private readonly path: string) {}

  private async load(): Promise<Db> {
    if (this.data) return this.data;
    try {
      const raw = await fs.readFile(this.path, "utf8");
      this.data = JSON.parse(raw) as Db;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.data = { recipes: {}, versions: {} };
      } else {
        throw err;
      }
    }
    return this.data;
  }

  private async flush(): Promise<void> {
    const data = await this.load();
    await fs.mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, this.path); // atomic replace
  }

  async saveRecipe(recipe: Recipe): Promise<void> {
    const d = await this.load();
    d.recipes[recipe.id] = structuredClone(recipe);
    await this.flush();
  }
  async getRecipe(id: RecipeId): Promise<Recipe | undefined> {
    const r = (await this.load()).recipes[id];
    return r ? structuredClone(r) : undefined;
  }
  async saveVersion(version: RecipeVersion): Promise<void> {
    const d = await this.load();
    d.versions[version.id] = structuredClone(version);
    await this.flush();
  }
  async getVersion(id: VersionId): Promise<RecipeVersion | undefined> {
    const v = (await this.load()).versions[id];
    return v ? structuredClone(v) : undefined;
  }
  async setHead(recipeId: RecipeId, versionId: VersionId): Promise<void> {
    const d = await this.load();
    const r = d.recipes[recipeId];
    if (!r) throw new Error(`recipe not found: ${recipeId}`);
    r.headVersionId = versionId;
    await this.flush();
  }
  async listRecipes(): Promise<Recipe[]> {
    return Object.values((await this.load()).recipes).map((r) => structuredClone(r));
  }
  async listVersions(): Promise<RecipeVersion[]> {
    return Object.values((await this.load()).versions).map((v) => structuredClone(v));
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm -C packages/cli test file-repository`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/db-path.ts packages/cli/src/file-repository.ts packages/cli/test/file-repository.test.ts
git commit -m "feat(cli): FileRepository (single JSON file, atomic writes) + db-path"
```

---

## Task 4: Command functions over `RecipeService`

These are the testable heart of the CLI: pure `async (svc, args) => result` functions, no process/fs/stdin. `scale` is imported from core.

**Files:**
- Create: `packages/cli/src/commands.ts`
- Test: `packages/cli/test/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/commands.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { InMemoryRepository, RecipeService, testDeps } from "@batch/core";
import type { RecipeContent } from "@batch/core";
import * as cmd from "../src/commands.js";

function content(): RecipeContent {
  return {
    steps: [{ componentKey: "s1", order: 1, instructionText: "Mix and bake", temperature: 350 }],
    slots: [{ componentKey: "sugar", name: "sugar", resolution: { kind: "raw", libraryIngredientId: "ing-sugar" } }],
    usages: [{ componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 200, quantityUnit: "g" }],
  };
}
function svc() { return new RecipeService(new InMemoryRepository(), testDeps()); }

describe("commands", () => {
  it("create returns recipe + version and is retrievable via show", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "Brownies", yield: { amount: 16, unit: "squares" }, content: content() });
    const shown = await cmd.show(s, version.id);
    expect(shown.name).toBe("Brownies");
    expect(shown.content.usages[0]?.quantityValue).toBe(200);
  });

  it("derive then override pins one component but inherits the rest", async () => {
    const s = svc();
    const { version: base } = await cmd.create(s, { name: "Base", yield: { amount: 16, unit: "squares" }, content: content() });
    const { version: variant } = await cmd.derive(s, { baseVersionId: base.id, name: "Low-sugar" });
    const { version: v2 } = await cmd.override(s, {
      versionId: variant.id,
      entry: { op: "replace", kind: "usage", target: "u1",
        payload: { componentKey: "u1", stepKey: "s1", slotKey: "sugar", quantityValue: 120, quantityUnit: "g" } },
      message: "cut sugar",
    });
    const shown = await cmd.show(s, v2.id);
    expect(shown.content.usages[0]?.quantityValue).toBe(120);
    expect(shown.content.steps[0]?.instructionText).toBe("Mix and bake");
  });

  it("edit changes metadata; history walks newest-first", async () => {
    const s = svc();
    const { version: v1 } = await cmd.create(s, { name: "A", yield: { amount: 1, unit: "x" }, content: content() });
    const { version: v2 } = await cmd.edit(s, { versionId: v1.id, patch: { name: "B", status: "approved" } });
    const hist = await cmd.history(s, v2.id);
    expect(hist.map((h) => h.name)).toEqual(["B", "A"]);
    expect(v2.status).toBe("approved");
  });

  it("scale halves quantities for a half batch", async () => {
    const s = svc();
    const { version } = await cmd.create(s, { name: "A", yield: { amount: 16, unit: "squares" }, content: content() });
    const scaled = await cmd.scale(s, version.id, 8);
    expect(scaled.usages[0]?.quantityValue).toBe(100);
  });

  it("list summarizes recipes by head version", async () => {
    const s = svc();
    const { version: base } = await cmd.create(s, { name: "Base", yield: { amount: 1, unit: "x" }, content: content() });
    await cmd.derive(s, { baseVersionId: base.id, name: "Variant" });
    const rows = await cmd.list(s);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name).sort()).toEqual(["Base", "Variant"]);
  });

  it("tree shows derivation edges (variant points at its base version)", async () => {
    const s = svc();
    const { version: base } = await cmd.create(s, { name: "Base", yield: { amount: 1, unit: "x" }, content: content() });
    const { version: variant } = await cmd.derive(s, { baseVersionId: base.id, name: "Variant" });
    const nodes = await cmd.tree(s);
    const variantNode = nodes.find((n) => n.versionId === variant.id);
    expect(variantNode?.derivesFromVersionId).toBe(base.id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/cli test commands`
Expected: FAIL — cannot find `../src/commands.js`.

- [ ] **Step 3: Implement `commands.ts`**

`packages/cli/src/commands.ts`:
```ts
import { scale as scaleContent } from "@batch/core";
import type {
  Author, OverrideEntry, Recipe, RecipeContent, RecipeVersion,
  RecipeService, VersionStatus, Yield,
} from "@batch/core";

// RecipeService is a class; import the type for signatures.
type Svc = InstanceType<typeof import("@batch/core").RecipeService>;

export interface CreateInput {
  name: string; description?: string; tags?: string[];
  yield: Yield; content: RecipeContent; author?: Author; commitMessage?: string;
}
export function create(svc: Svc, input: CreateInput): Promise<{ recipe: Recipe; version: RecipeVersion }> {
  return svc.createRecipe(input);
}

export function derive(
  svc: Svc, input: { baseVersionId: string; name: string; commitMessage?: string },
): Promise<{ recipe: Recipe; version: RecipeVersion }> {
  return svc.deriveVariant(input);
}

export function override(
  svc: Svc, input: { versionId: string; entry: OverrideEntry; message?: string },
): Promise<{ version: RecipeVersion }> {
  return svc.applyOverride({ versionId: input.versionId, entry: input.entry, commitMessage: input.message });
}

export interface EditPatch {
  name?: string; description?: string; tags?: string[]; yield?: Yield; status?: VersionStatus;
}
export function edit(
  svc: Svc, input: { versionId: string; patch: EditPatch; message?: string },
): Promise<{ version: RecipeVersion }> {
  return svc.editMetadata({ versionId: input.versionId, patch: input.patch, commitMessage: input.message });
}

export function show(svc: Svc, versionId: string): Promise<RecipeVersion> {
  return svc.getVersion(versionId);
}

export function resolve(svc: Svc, versionId: string): Promise<RecipeContent> {
  return svc.resolve(versionId);
}

export async function scale(svc: Svc, versionId: string, to: number): Promise<RecipeContent> {
  const v = await svc.getVersion(versionId);
  return scaleContent(v.content, v.yield, to);
}

export function history(svc: Svc, versionId: string): Promise<RecipeVersion[]> {
  return svc.getHistory(versionId);
}

export interface ListRow {
  recipeId: string; headVersionId: string; name: string;
  status: VersionStatus; tags: string[]; isVariant: boolean;
}
export async function list(svc: Svc): Promise<ListRow[]> {
  const recipes = await svc.listRecipes();
  const rows = await Promise.all(recipes.map(async (r): Promise<ListRow> => {
    const v = await svc.getVersion(r.headVersionId);
    return {
      recipeId: r.id, headVersionId: v.id, name: v.name,
      status: v.status, tags: v.tags, isVariant: v.derivesFromVersionId !== undefined,
    };
  }));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface TreeNode {
  versionId: string; recipeId: string; name: string;
  derivesFromVersionId?: string; prevVersionId?: string;
}
export async function tree(svc: Svc): Promise<TreeNode[]> {
  const versions = await svc.listVersions();
  return versions.map((v) => ({
    versionId: v.id, recipeId: v.recipeId, name: v.name,
    derivesFromVersionId: v.derivesFromVersionId, prevVersionId: v.prevVersionId,
  }));
}
```

NOTE on the `Svc` type: import the class type cleanly instead of the inline `import(...)` if simpler — `import type { RecipeService } from "@batch/core"` then `svc: RecipeService`. Use whichever the typechecker accepts; the runtime behavior is identical. Prefer:
```ts
import type { RecipeService } from "@batch/core";
// ...and use `svc: RecipeService` everywhere, dropping the `Svc`/`InstanceType` shim.
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/cli test commands && pnpm -C packages/cli typecheck`
Expected: PASS (6 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/test/commands.test.ts
git commit -m "feat(cli): command functions (create/derive/override/edit/show/resolve/scale/history/list/tree)"
```

---

## Task 5: CLI wiring (`commander`) + entrypoint + shim

Thin glue: parse argv, read JSON from stdin or `--file` where needed, build `FileRepository` + `RecipeService` + `realDeps`, dispatch to a command, print the result as pretty JSON. Errors print `{ "error": "..." }` to stderr and exit 1.

**Files:**
- Create: `packages/cli/src/cli.ts`, `packages/cli/src/bin.ts`, `batch` (root shim)
- Test: smoke-tested live in Task 7 (wiring is thin; logic is already covered in Task 4)

- [ ] **Step 1: Write `cli.ts`**

`packages/cli/src/cli.ts`:
```ts
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { RecipeService, realDeps } from "@batch/core";
import type { OverrideEntry } from "@batch/core";
import { FileRepository } from "./file-repository.js";
import { resolveDbPath } from "./db-path.js";
import * as cmd from "./commands.js";

function makeService(): RecipeService {
  return new RecipeService(new FileRepository(resolveDbPath()), realDeps());
}

function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

async function readJson(file?: string): Promise<any> {
  const raw = file ? await readFile(file, "utf8") : await readStdin();
  if (!raw.trim()) throw new Error("expected JSON on stdin or via --file");
  return JSON.parse(raw);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("batch").description("git for recipes — versioned recipe substrate").version("0.0.0");

  program.command("init")
    .description("show the store path (created lazily on first write)")
    .action(() => out({ db: resolveDbPath() }));

  program.command("create")
    .description("create a recipe from JSON ({name,yield,content,...}) on stdin or --file")
    .option("-f, --file <path>", "read input JSON from a file instead of stdin")
    .action(async (opts) => out(await cmd.create(makeService(), await readJson(opts.file))));

  program.command("derive <baseVersionId>")
    .description("fork a variant off a base version")
    .requiredOption("-n, --name <name>", "name for the new variant")
    .option("-m, --message <msg>", "commit message")
    .action(async (baseVersionId, opts) =>
      out(await cmd.derive(makeService(), { baseVersionId, name: opts.name, commitMessage: opts.message })));

  program.command("override <versionId>")
    .description("apply one override entry (JSON on stdin or --file) to a variant")
    .option("-f, --file <path>", "read the override entry JSON from a file")
    .option("-m, --message <msg>", "commit message")
    .action(async (versionId, opts) => {
      const entry = (await readJson(opts.file)) as OverrideEntry;
      out(await cmd.override(makeService(), { versionId, entry, message: opts.message }));
    });

  program.command("edit <versionId>")
    .description("edit version metadata (name/description/status/tags/yield)")
    .option("-n, --name <name>")
    .option("-d, --description <text>")
    .option("-s, --status <status>", "draft | approved | rejected")
    .option("-t, --tags <csv>", "comma-separated tags")
    .option("--yield-amount <n>", "yield amount", parseFloat)
    .option("--yield-unit <unit>", "yield unit")
    .option("-m, --message <msg>", "commit message")
    .action(async (versionId, opts) => {
      const patch: cmd.EditPatch = {};
      if (opts.name !== undefined) patch.name = opts.name;
      if (opts.description !== undefined) patch.description = opts.description;
      if (opts.status !== undefined) patch.status = opts.status;
      if (opts.tags !== undefined) patch.tags = String(opts.tags).split(",").map((t) => t.trim()).filter(Boolean);
      if (opts.yieldAmount !== undefined && opts.yieldUnit !== undefined) {
        patch.yield = { amount: opts.yieldAmount, unit: opts.yieldUnit };
      }
      out(await cmd.edit(makeService(), { versionId, patch, message: opts.message }));
    });

  program.command("show <versionId>")
    .description("show a version with its resolved content")
    .action(async (versionId) => out(await cmd.show(makeService(), versionId)));

  program.command("resolve <versionId>")
    .description("print only the resolved RecipeContent")
    .action(async (versionId) => out(await cmd.resolve(makeService(), versionId)));

  program.command("scale <versionId>")
    .description("scale quantities to a target yield amount")
    .requiredOption("--to <n>", "target yield amount", parseFloat)
    .action(async (versionId, opts) => out(await cmd.scale(makeService(), versionId, opts.to)));

  program.command("history <versionId>")
    .description("walk the version history newest-first")
    .action(async (versionId) => out(await cmd.history(makeService(), versionId)));

  program.command("list")
    .description("list all recipes by head version")
    .action(async () => out(await cmd.list(makeService())));

  program.command("tree")
    .description("list all versions with their derivation/history edges")
    .action(async () => out(await cmd.tree(makeService())));

  await program.parseAsync(argv, { from: "user" });
}
```

- [ ] **Step 2: Write `bin.ts`**

`packages/cli/src/bin.ts`:
```ts
#!/usr/bin/env node
import { run } from "./cli.js";

run(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: message }, null, 2) + "\n");
  process.exit(1);
});
```

- [ ] **Step 3: Write the root `batch` shim**

Create `batch` (at repo root):
```sh
#!/usr/bin/env sh
# Run the Batch CLI via tsx (no build step). Resolves relative to this script.
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/node_modules/.bin/tsx" "$DIR/packages/cli/src/bin.ts" "$@"
```

Then make it executable:
```bash
chmod +x batch
```

- [ ] **Step 4: Smoke-test the wired CLI by hand**

Run (uses an isolated temp store so it doesn't touch the real `~/.batch`):
```bash
BATCH_DB=$(pwd)/.test-tmp/smoke.json ./batch init
```
Expected: prints `{ "db": ".../.test-tmp/smoke.json" }`.

```bash
echo '{"name":"Smoke","yield":{"amount":1,"unit":"x"},"content":{"steps":[],"slots":[],"usages":[]}}' \
  | BATCH_DB=$(pwd)/.test-tmp/smoke.json ./batch create
```
Expected: prints a JSON object with `recipe` and `version`, `version.name == "Smoke"`.

```bash
BATCH_DB=$(pwd)/.test-tmp/smoke.json ./batch list
rm -rf .test-tmp
```
Expected: a one-row list with name `Smoke`; then cleanup.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/src/bin.ts batch
git commit -m "feat(cli): commander wiring, bin entrypoint, ./batch shim"
```

---

## Task 6: The Claude `batch` skill

A project-level skill teaching the agent to operate the CLI: the model, the JSON shapes, the workflow (Instagram caption → recipe JSON → create → tune → derive), and rendering conventions.

**Files:**
- Create: `.claude/skills/batch/SKILL.md`

- [ ] **Step 1: Write `SKILL.md`**

`.claude/skills/batch/SKILL.md`:
````markdown
---
name: batch
description: Use when the user wants to add, tune, fork, scale, or browse cooking recipes in their Batch store (the "git for recipes" CLI) — e.g. importing an Instagram/blog recipe, creating a base, deriving a variant, adjusting an ingredient, or viewing their recipe tree.
---

# Batch — git for recipes

Batch stores recipes as **immutable versions** on two edges: a **history** edge (each edit is a new version) and a **derivation** edge (a *variant* is forked from a base version and stores only component-level **overrides**, inheriting everything else). A recipe's content is always a materialized snapshot of `{ steps, slots, usages }`.

Operate it through the `batch` CLI (run from the repo root `/Users/williamjin/Documents/batch`). Every command prints JSON; parse it and render the result to the user clearly (a readable summary, not raw JSON, unless they ask). On error the CLI prints `{ "error": "..." }` to stderr and exits non-zero.

## The data model (what you author)

A recipe's `content` has three arrays joined by `componentKey` (stable, human-readable keys you choose, e.g. `sugar`, `s1`, `u_sugar`):

- **steps**: `{ componentKey, order, instructionText, section?, timerSeconds?, temperature? }`
- **slots** (an ingredient "slot" — the swap point): `{ componentKey, name, prepDefault?, resolution: { kind: "raw", libraryIngredientId } }` — for now always `kind: "raw"`; use a slug like `ing-sugar` for `libraryIngredientId`.
- **usages** (a quantity of a slot used in a step): `{ componentKey, stepKey, slotKey, quantityValue, quantityUnit, prepState? }`

`yield` is `{ amount, unit }` (e.g. `{ amount: 16, unit: "squares" }`).

## Commands

- `./batch create` — reads recipe JSON `{ name, yield, content, description?, tags? }` from **stdin**. Prints `{ recipe, version }`.
- `./batch derive <baseVersionId> --name "<name>"` — fork a variant. Prints `{ recipe, version }`.
- `./batch override <versionId> -m "<msg>"` — reads ONE override entry from **stdin**; applies it to a variant (creates a new version). Entry shapes:
  - replace: `{ "op": "replace", "kind": "usage", "target": "u_sugar", "payload": { ...full StepUsage... } }` (kind ∈ step|slot|usage)
  - add: `{ "op": "add", "kind": "slot", "payload": { ...full IngredientSlot... } }`
  - remove: `{ "op": "remove", "kind": "step", "target": "s2" }`
  Overrides only apply to **variants** (versions created by `derive`). To change a base/root recipe, use `edit` (metadata) or create a new version another way.
- `./batch edit <versionId> [--name --description --status --tags a,b --yield-amount N --yield-unit U -m msg]` — new version with changed metadata; content unchanged. `--status` ∈ draft|approved|rejected.
- `./batch show <versionId>` — the version + resolved content.
- `./batch resolve <versionId>` — just the resolved content.
- `./batch scale <versionId> --to <amount>` — content with quantities scaled to a target yield amount (units preserved; step times intentionally NOT scaled).
- `./batch history <versionId>` — versions newest-first along the history edge.
- `./batch list` — all recipes by head version (`name, status, tags, isVariant`).
- `./batch tree` — all versions with `derivesFromVersionId` / `prevVersionId` edges (build the forest of bases → variants).
- `./batch init` — print the store path (`$BATCH_DB`, else `~/.batch/db.json`).

## Typical workflow (the user's real loop)

1. The user shares an Instagram reel caption, a blog URL, or a screenshot of a recipe.
2. **You** parse it into the `create` JSON: split the method into `steps`, each ingredient into a `slot`, each "Xg of Y in step Z" into a `usage`. Choose clean `componentKey`s. If ingredients aren't tied to specific steps, attach them all to the first/relevant step.
3. Run `./batch create` (pipe the JSON via stdin). Report the new `version.id`.
4. Tune conversationally: cut sugar, swap an ingredient, change bake temp → `./batch override` (on a variant) or for the base, capture the change as a new create/derive as appropriate.
5. To spin a new flavor off a dialed-in base: `./batch derive <baseVersionId> --name "Biscoff Cheesecake"`, then `override` the differences.
6. Browse with `./batch list` / `./batch tree`; scale a batch with `./batch scale`.

## Running commands

Pipe stdin for `create`/`override`. Example:
```bash
echo '<recipe-json>' | ./batch create
```
Prefer a heredoc or a temp `--file` for large JSON. Always run from `/Users/williamjin/Documents/batch`. To target a scratch store, prefix `BATCH_DB=/path/to/db.json`.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/batch/SKILL.md
git commit -m "feat(skill): batch Claude skill — operate the CLI conversationally"
```

---

## Task 7: End-to-end dogfood verification

Prove the whole loop with a real-ish recipe against an isolated store, then clean up. (This is a manual verification task — no new files.)

- [ ] **Step 1: Full lifecycle against a scratch store**

```bash
export BATCH_DB=$(pwd)/.test-tmp/dogfood.json
echo '{"name":"Base Cheesecake","yield":{"amount":12,"unit":"slices"},"tags":["dessert","cheesecake"],"content":{"steps":[{"componentKey":"s1","order":1,"instructionText":"Beat cream cheese and sugar","section":"filling"},{"componentKey":"s2","order":2,"instructionText":"Bake","temperature":320,"timerSeconds":3000}],"slots":[{"componentKey":"cc","name":"cream cheese","resolution":{"kind":"raw","libraryIngredientId":"ing-cream-cheese"}},{"componentKey":"sugar","name":"sugar","resolution":{"kind":"raw","libraryIngredientId":"ing-sugar"}}],"usages":[{"componentKey":"u_cc","stepKey":"s1","slotKey":"cc","quantityValue":680,"quantityUnit":"g"},{"componentKey":"u_sugar","stepKey":"s1","slotKey":"sugar","quantityValue":150,"quantityUnit":"g"}]}}' | ./batch create
```
Expected: JSON with `version.name == "Base Cheesecake"`. Note the `version.id` (it is `id2` under deterministic ids? No — real deps here, so a UUID). Capture it.

- [ ] **Step 2: Derive a variant, override it, show it**

Using the base `version.id` from Step 1 (call it `$BASE`):
```bash
./batch derive "$BASE" --name "Banana Cheesecake"      # capture variant version id -> $VAR
echo '{"op":"add","kind":"slot","payload":{"componentKey":"banana","name":"banana","resolution":{"kind":"raw","libraryIngredientId":"ing-banana"}}}' | ./batch override "$VAR" -m "add banana"   # -> $VAR2
./batch show "$VAR2"
```
Expected: `show` output's `content.slots` includes both `cream cheese`/`sugar` (inherited) and `banana` (added override); `derivesFromVersionId` on the variant equals `$BASE`.

- [ ] **Step 3: List, tree, scale, then clean up**

```bash
./batch list
./batch tree
./batch scale "$BASE" --to 6   # half batch -> sugar 75g, cream cheese 340g
unset BATCH_DB
rm -rf .test-tmp
```
Expected: `list` shows 2 recipes (Base Cheesecake, Banana Cheesecake); `tree` shows the derivation edge; `scale` halves quantities. Cleanup leaves the tree clean (`.test-tmp` is git-ignored or removed).

- [ ] **Step 4: Ensure scratch artifacts are ignored**

Create/confirm `.gitignore` contains `node_modules`, `dist`, `.test-tmp`, and that the real store lives outside the repo (`~/.batch`). Add `.gitignore` if missing:
```
node_modules/
dist/
.test-tmp/
*.tmp
```

- [ ] **Step 5: Commit any cleanup**

```bash
git add .gitignore
git commit -m "chore: gitignore node_modules, dist, scratch stores"
```

---

## Self-review (completed during planning)

- **Coverage:** persistence (T3), the full command surface create/derive/override/edit/show/resolve/scale/history/list/tree (T4–T5), the agent interface (T6), and a real end-to-end loop (T7). Enumeration needed by list/tree is added to the core seam (T1).
- **Purity preserved:** `core` gains no `fs`/`process` imports; all I/O is in `@batch/cli`. The `Repository` interface remains the only coupling.
- **Type consistency:** command functions reuse core's exact types (`OverrideEntry`, `RecipeContent`, `Yield`, `VersionStatus`); CLI passes `commitMessage` through the same service methods M1 defined.
- **Determinism:** command tests use `InMemoryRepository` + `testDeps`; `FileRepository` tests use a fixed `.test-tmp` path with before/after cleanup; no `Date.now()`/random in tests.

## What this unlocks + what's next

After this slice: recipes persist on disk, the `batch` CLI drives the full M1 substrate, and the skill lets the user build their tree conversationally (paste a recipe → create → derive → override). **Macros are the next layer (M2)** — `library_ingredient` + gram-canonical `computeMacros`, snapshotting per version, so every version shows calories/protein/etc. The tree built now carries straight into M2 unchanged.
