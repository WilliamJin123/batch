# Batch Web Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, hosted Next.js app that renders the real `~/.batch/db.json` as a full Bake Card per recipe plus a pannable/zoomable recipe Tree, with numbers identical to the CLI.

**Architecture:** A new `packages/web` (Next.js App Router, SSG). **Server components** compute view-models at build time via a `RecipeSource` seam backed by `@batch/core` over the baked `db.json`. **Client components** receive serialized view-models as props and own interaction only (pan/zoom/hover/toggle). All domain logic stays in `@batch/core` (zero macro math in the web). Writes are declared on the seam but unimplemented (the "no rewrite later" guarantee).

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript, `@batch/core` via `transpilePackages`, `@dagrejs/dagre` for graph layout, Vitest + Testing Library + jsdom, CSS Modules with the locked token system. Hosting: Vercel.

**Source-of-truth references (read before starting):**
- Spec: `docs/superpowers/specs/2026-06-18-batch-web-viewer-frontend-design.md`
- Visual references (committed in Task 2): `packages/web/design-reference/tree.html`, `packages/web/design-reference/red-velvet.html` — these contain the exact markup + CSS to port. They are real artifacts, not placeholders.

**Core API facts (verified against `packages/core/src`):**
- `db.json` = `{ recipes, versions, ingredients, feedback }`, each a `Record<id, T>`.
- Seed a repo: `new InMemoryRepository()` + `saveRecipe/saveVersion/saveIngredient/saveFeedback`.
- `new RecipeService(repo, realDeps())`. Read methods used: `listRecipes()`, `listVersions()`, `getRecipe(id)`, `getVersion(id)`, `exportCard(versionId) → {version, content, macros}`, `macrosBySection(versionId) → {snapshot, bySection}`, `flatten(versionId) → {content, sources}`, `feedbackForRecipe(recipeId)`, `feedbackSummary()`, `compare(versionIds) → CompareView`.
- A recipe's NAME lives on its head version (`version.name`); `recipe.headVersionId` is the head.
- `version.macros: MacroSnapshot` = `{ total, perServing, yield, basis, unresolved, lines, caloriesPerGramProtein? }`. `Macros` = `{calories, protein, carbs, fat, fiber}`.
- `MacroLine` = `{ slotKey, ingredientId?, ingredientName?, grams?, macros?, status }`. After `flatten`/`exportCard`, `content.usages[i]` aligns 1:1 with `macros.lines[i]` (same index — used by `macrosBySection`).
- Derive edge: `version.derivesFromVersionId` → base version → its `recipeId`. Compose edge: `version.content.slots[].resolution` where `kind==="sub_recipe"` → `subRecipeVersionId` → its `recipeId`.

---

## File Structure

```
packages/web/
  package.json
  next.config.mjs                 # transpilePackages: ['@batch/core']
  tsconfig.json
  vitest.config.ts
  .gitignore                      # data/db.json
  scripts/bake-data.mjs           # copy $BATCH_DB|~/.batch/db.json -> data/db.json
  design-reference/               # committed mockups (visual source of truth)
    tree.html  red-velvet.html
  data/
    db.json                       # baked (gitignored); produced by bake-data
  test/fixtures/db.fixture.json   # small committed db for tests
  lib/
    source/db.ts                  # RawDb, buildRepository, serviceFrom, loadDb
    source/RecipeSource.ts        # interface (reads + declared writes)
    source/StaticRecipeSource.ts  # reads impl; writes throw
    viewmodel/types.ts            # BakeCardVM, TreeGraphVM, RecipeSummary, ...
    viewmodel/bakeCard.ts
    viewmodel/treeGraph.ts
    viewmodel/compare.ts
    viewmodel/format.ts           # qty formatting, rating mapping
    layout/useGraphLayout.ts      # dagre wrapper (pure fn + hook)
  components/
    shared/ TopBar.tsx MacroLine.tsx RatingChip.tsx StateDot.tsx
    card/ RecipeHero.tsx IngredientList.tsx CompositionRollup.tsx Lineage.tsx TastingLog.tsx Method.tsx
    tree/ TreeCanvas.tsx RecipeNode.tsx EdgeLayer.tsx TreeOutline.tsx BakeoffPill.tsx Legend.tsx CanvasControls.tsx
  app/
    layout.tsx  page.tsx          # Tree
    r/[recipeId]/page.tsx         # Bake Card
    index/page.tsx                # Recipes list
  styles/ tokens.css *.module.css
```

Decomposition: the `lib/` logic layers are pure and TDD'd (this is where correctness lives). Components are render-smoke-tested and port styling from `design-reference/`. Pages are thin server components that call the source and render.

---

## Phase 0 — Scaffold & reference

### Task 1: Scaffold `packages/web`

**Files:**
- Create: `packages/web/package.json`, `next.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Write `packages/web/package.json`**

```json
{
  "name": "@batch/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "node scripts/bake-data.mjs && next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@batch/core": "workspace:*",
    "@dagrejs/dagre": "^1.1.4",
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@batch/core"],
  reactStrictMode: true,
  // @batch/core is raw ESM-TS: its intra-package imports use `.js` specifiers that point
  // at `.ts` files (e.g. `./types.js` -> `types.ts`), with no build step. transpilePackages
  // tells Next to COMPILE core, but webpack must also be told to RESOLVE those `.js`
  // specifiers to `.ts` sources — otherwise `next build` dies on "Can't resolve './types.js'".
  // This alias is the isolated fix: it touches ONLY the web package (not core/CLI/tsconfig).
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "preserve", "strict": true, "noEmit": true,
    "esModuleInterop": true, "skipLibCheck": true, "resolveJsonModule": true,
    "paths": { "@/*": ["./*"] }, "plugins": [{ "name": "next" }]
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "jsdom", globals: true, include: ["**/*.test.ts", "**/*.test.tsx"] },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
/.next
/data/db.json
node_modules
```

- [ ] **Step 6: Write a minimal `app/layout.tsx` and `app/page.tsx` so the app boots**

```tsx
// app/layout.tsx
export const metadata = { title: "Batch" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
```
```tsx
// app/page.tsx — imports @batch/core so the build PROVES webpack resolves the raw-TS
// ESM package (the `.js`-specifier resolution gate) at real build time, not just typecheck.
import { RecipeService } from "@batch/core";
export default function Page() {
  return <main>Batch web — scaffold (core: {RecipeService.name})</main>;
}
```

- [ ] **Step 7: Install + typecheck**

Run: `pnpm install && pnpm --filter @batch/web typecheck`
Expected: install resolves `@batch/core` as a workspace dep; typecheck passes (no errors).

- [ ] **Step 7b: PROVE the core ESM resolution with a real build (load-bearing gate)**

Run: `pnpm --filter @batch/web exec next build`  (call `next build` DIRECTLY, not the `build`
npm-script — that script also runs `scripts/bake-data.mjs`, which doesn't exist until Task 3.)
Expected: `next build` compiles and the `/` route resolves `@batch/core` — whose intra-package
imports use `.js` specifiers on `.ts` files — with **no** `Module not found: Can't resolve './types.js'`.
If it fails here, the `webpack.resolve.extensionAlias` in `next.config.mjs` is the fix; do NOT
proceed to any other task until this build is green. (Fallback only if extensionAlias proves
insufficient: build `@batch/core` to `dist/` with an `exports` map — but that regresses the
CLI's no-build tsx dev loop, so treat it as a last resort.) The build may warn that there's no
data yet — fine; this step only proves package resolution.

- [ ] **Step 8: Commit**

```bash
git add packages/web
git commit -m "feat(web): scaffold Next.js package wired to @batch/core"
```

### Task 2: Commit the design reference + tokens

**Files:**
- Create: `packages/web/design-reference/tree.html`, `packages/web/design-reference/red-velvet.html`, `packages/web/styles/tokens.css`

- [ ] **Step 1: Copy the two approved mockups into the repo as the visual source of truth**

Run (the mockups live in the brainstorm session dir; copy the latest):
```bash
SRC=$(ls -dt /Users/williamjin/Documents/batch/.superpowers/brainstorm/*/content | head -1)
mkdir -p packages/web/design-reference
cp "$SRC/tree.html" "$SRC/red-velvet.html" packages/web/design-reference/
```
Expected: both files exist under `packages/web/design-reference/`. (If the brainstorm dir is gone, regenerate is unnecessary — any committed copy is fine; the point is an in-repo pixel reference.)

- [ ] **Step 2: Extract the shared token block into `styles/tokens.css`**

Copy the `:root{ --page … --mono }` variable block verbatim from `design-reference/tree.html` into `packages/web/styles/tokens.css` (wrap in `:root{ … }`). These are the locked tokens:

```css
:root{
  --page:#FBF7F0; --surface:#FFFDFA; --panel:#FFFFFF;
  --ink:#241D13; --ink-soft:#463D2E; --muted:#8C8474; --faint:#B5AC9A;
  --line:rgba(60,44,18,.10); --line2:rgba(60,44,18,.16);
  --accent:#B47A37; --accent-deep:#956120; --accent-soft:#F6EBD9;
  --green:#5E9A6B; --gold:#C79A3B; --warn:#9a5230;
  --serif:'Fraunces',Georgia,serif; --mono:'JetBrains Mono',ui-monospace,monospace; --sans:'Inter',system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--page);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;font-size:14px}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/design-reference packages/web/styles/tokens.css
git commit -m "docs(web): commit approved mockups as design reference + extract tokens"
```

### Task 3: bake-data script + test fixture

**Files:**
- Create: `packages/web/scripts/bake-data.mjs`, `packages/web/test/fixtures/db.fixture.json`

- [ ] **Step 1: Write `scripts/bake-data.mjs`**

```js
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const src = process.env.BATCH_DB || join(homedir(), ".batch", "db.json");
const dest = join(dirname(new URL(import.meta.url).pathname), "..", "data", "db.json");

const raw = await fs.readFile(src, "utf8");           // throws if missing → fail the build loudly
JSON.parse(raw);                                       // validate it parses
await fs.mkdir(dirname(dest), { recursive: true });
await fs.writeFile(dest, raw, "utf8");
console.log(`baked ${src} -> ${dest} (${raw.length} bytes)`);
```

- [ ] **Step 2: Create a small committed fixture for tests**

Run (snapshot a few real recipes so tests have stable, complete data incl. a composed recipe + feedback):
```bash
node -e '
const fs=require("fs"),os=require("os"),p=require("path");
const db=JSON.parse(fs.readFileSync(process.env.BATCH_DB||p.join(os.homedir(),".batch/db.json"),"utf8"));
fs.mkdirSync("packages/web/test/fixtures",{recursive:true});
fs.writeFileSync("packages/web/test/fixtures/db.fixture.json",JSON.stringify(db,null,2));
console.log("fixture recipes:",Object.keys(db.recipes).length);
'
```
Expected: prints `fixture recipes: 25` (or current count). The fixture is the WHOLE real store — small enough to commit and guarantees parity tests run on real data (Turtle, Red Velvet A/B, sub-recipes, feedback).

- [ ] **Step 3: Commit**

```bash
git add packages/web/scripts/bake-data.mjs packages/web/test/fixtures/db.fixture.json
git commit -m "feat(web): bake-data script + real-store test fixture"
```

---

## Phase 1 — Data layer & view-models (TDD)

### Task 4: db loader + repository + read-only service

**Files:**
- Create: `lib/source/db.ts`, `lib/source/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/source/db.test.ts
import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "./db";

describe("db loader", () => {
  it("seeds a service whose recipe count matches the fixture", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const recipes = await svc.listRecipes();
    expect(recipes.length).toBe(Object.keys((fixture as any).recipes).length);
  });
  it("resolves a recipe name to a bake card via exportCard", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const rv = (await svc.listVersions()).find((v) => v.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
    const card = await svc.exportCard(rv.id);
    expect(card.macros.perServing.calories).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run → fails** (`buildRepository` not defined). Run: `pnpm --filter @batch/web test db`

- [ ] **Step 3: Implement `lib/source/db.ts`**

```ts
import {
  InMemoryRepository, RecipeService, realDeps,
  type Repository, type Recipe, type RecipeVersion, type LibraryIngredient, type FeedbackEntry,
} from "@batch/core";

export interface RawDb {
  recipes: Record<string, Recipe>;
  versions: Record<string, RecipeVersion>;
  ingredients: Record<string, LibraryIngredient>;
  feedback: Record<string, FeedbackEntry>;
}

export async function buildRepository(db: RawDb): Promise<Repository> {
  const repo = new InMemoryRepository();
  for (const r of Object.values(db.recipes ?? {})) await repo.saveRecipe(r);
  for (const v of Object.values(db.versions ?? {})) await repo.saveVersion(v);
  for (const i of Object.values(db.ingredients ?? {})) await repo.saveIngredient(i);
  for (const f of Object.values(db.feedback ?? {})) await repo.saveFeedback(f);
  return repo;
}

/** realDeps() is harmless here — read paths never call newId()/now(). */
export function serviceFrom(repo: Repository): RecipeService {
  return new RecipeService(repo, realDeps());
}

/** Build-time only (Node): read the baked db.json. */
export async function loadDb(): Promise<RawDb> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const path = join(process.cwd(), "data", "db.json");
  return JSON.parse(await readFile(path, "utf8")) as RawDb;
}
```

- [ ] **Step 4: Run → passes.** Run: `pnpm --filter @batch/web test db`

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/source/db.ts packages/web/lib/source/db.test.ts
git commit -m "feat(web): db loader + read-only RecipeService factory (TDD)"
```

### Task 5: view-model types + RecipeSource seam

**Files:**
- Create: `lib/viewmodel/types.ts`, `lib/source/RecipeSource.ts`, `lib/source/StaticRecipeSource.ts`, `lib/source/StaticRecipeSource.test.ts`

- [ ] **Step 1: Write `lib/viewmodel/types.ts`** (the shapes components render)

```ts
export interface MacroVM { calories: number; protein: number; carbs: number; fat: number; fiber: number; }
export interface RecipeSummary {
  recipeId: string; versionId: string; name: string; tags: string[];
  kind: "base" | "variant" | "root" | "sub-recipe"; family: string;
  cal: number; protein: number; calPerGramProtein: number | null; servings: number; servingUnit: string;
  made: boolean; rating?: "bad" | "okay" | "good" | "excellent"; queued: boolean;
}
export interface IngredientRowVM { qtyNatural: string; grams?: number; name: string; }
export interface IngredientGroupVM { title: string; subRecipe: boolean; calories: number; items: IngredientRowVM[]; }
export interface BakeCardVM {
  recipeId: string; versionId: string; shortSha: string;
  name: string; description?: string; tags: string[];
  made: boolean; rating?: "bad" | "okay" | "good" | "excellent"; queued: boolean;
  yield: { amount: number; unit: string };
  perServing: MacroVM; whole: MacroVM; calPerGramProtein: number | null; basis: "complete" | "partial";
  ingredientGroups: IngredientGroupVM[];
  composition: Array<{ name: string; calories: number; protein: number }>;
  lineage: Array<{ name: string; rel: "forked-from" | "composes" | "sibling"; recipeId?: string }>;
  method: Array<{ section: string; steps: Array<{ text: string; tempF?: number; minutes?: number }> }>;
  tastingLog: Array<{ kind: "made" | "to-make"; rating?: string; date: string; note?: string; component?: string }>;
}
export interface TreeNodeVM extends RecipeSummary { feedbackNote?: string; needsTuning: boolean; }
export interface TreeEdgeVM { from: string; to: string; rel: "derives" | "composes"; }
export interface BakeoffVM { a: string; b: string; note: BakeoffNote; }
export interface BakeoffNote {
  a: { name: string; cal: number; calPerGramProtein: number | null; servings: number };
  b: { name: string; cal: number; calPerGramProtein: number | null; servings: number };
  differingIngredients: Array<{ name: string; a: number | "present" | null; b: number | "present" | null }>;
}
export interface TreeGraphVM { nodes: TreeNodeVM[]; edges: TreeEdgeVM[]; bakeoffs: BakeoffVM[]; }
```

- [ ] **Step 2: Write `lib/source/RecipeSource.ts`** (the seam — reads now, writes declared)

```ts
import type { BakeCardVM, RecipeSummary, TreeGraphVM } from "../viewmodel/types";

export interface RecipeSource {
  listRecipes(): Promise<RecipeSummary[]>;
  getBakeCard(recipeId: string): Promise<BakeCardVM>;
  getTreeGraph(): Promise<TreeGraphVM>;

  // --- writes: declared for the "no rewrite later" guarantee; NOT implemented in v1 ---
  // Implementing these later = calling the same @batch/core mutations the CLI uses
  // (derive/applyOverride/editMetadata/addFeedback/promote/rebase) behind an API route.
  applyOverride?(recipeId: string, entry: unknown): Promise<never>;
  addFeedback?(recipeId: string, input: unknown): Promise<never>;
}
```

- [ ] **Step 3: Write the failing test for `StaticRecipeSource`**

```ts
// lib/source/StaticRecipeSource.test.ts
import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { StaticRecipeSource } from "./StaticRecipeSource";

const src = () => StaticRecipeSource.fromDb(fixture as any);

describe("StaticRecipeSource", () => {
  it("lists every recipe with a family and a kind", async () => {
    const list = await (await src()).listRecipes();
    expect(list.length).toBe(Object.keys((fixture as any).recipes).length);
    expect(list.every((r) => r.family && r.kind)).toBe(true);
  });
  it("throws on any write attempt", async () => {
    const s: any = await src();
    expect(typeof s.applyOverride === "undefined" || (() => { try { s.applyOverride("x", {}); return false; } catch { return true; } })()).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run → fails.** Run: `pnpm --filter @batch/web test StaticRecipeSource`

- [ ] **Step 5: Implement `lib/source/StaticRecipeSource.ts`**

```ts
import { type RecipeService } from "@batch/core";
import { buildRepository, serviceFrom, type RawDb } from "./db";
import type { RecipeSource } from "./RecipeSource";
import type { BakeCardVM, RecipeSummary, TreeGraphVM } from "../viewmodel/types";
import { buildSummaries } from "../viewmodel/treeGraph";
import { buildBakeCard } from "../viewmodel/bakeCard";
import { buildTreeGraph } from "../viewmodel/treeGraph";

export class StaticRecipeSource implements RecipeSource {
  private constructor(private svc: RecipeService) {}
  static async fromDb(db: RawDb): Promise<StaticRecipeSource> {
    return new StaticRecipeSource(serviceFrom(await buildRepository(db)));
  }
  listRecipes(): Promise<RecipeSummary[]> { return buildSummaries(this.svc); }
  getBakeCard(recipeId: string): Promise<BakeCardVM> { return buildBakeCard(this.svc, recipeId); }
  getTreeGraph(): Promise<TreeGraphVM> { return buildTreeGraph(this.svc); }
  // writes intentionally omitted in v1 (optional on the interface) → any call is a type/runtime error.
}
```

(Implements `buildSummaries`/`buildTreeGraph`/`buildBakeCard` in Tasks 6–8; create thin stubs that throw `"todo"` now so this compiles, replaced next.)

- [ ] **Step 6: Run → passes** (after Tasks 6–8 land; for now stub the three builders to satisfy types, test `listRecipes` once Task 7 lands). Commit the seam:

```bash
git add packages/web/lib/viewmodel/types.ts packages/web/lib/source/RecipeSource.ts packages/web/lib/source/StaticRecipeSource.ts packages/web/lib/source/StaticRecipeSource.test.ts
git commit -m "feat(web): RecipeSource seam + StaticRecipeSource (reads; writes declared-unimplemented)"
```

### Task 6: Bake Card adapter (TDD — macro parity + dual units)

**Files:**
- Create: `lib/viewmodel/format.ts`, `lib/viewmodel/bakeCard.ts`, `lib/viewmodel/bakeCard.test.ts`

- [ ] **Step 1: Write `lib/viewmodel/format.ts`**

```ts
import type { Rating } from "@batch/core";
/** Natural quantity string: trims trailing zeros, spells units as authored. */
export function qtyNatural(value: number, unit: string): string {
  const v = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  return unit === "each" ? v : `${v} ${unit}`;
}
export function roundGrams(g?: number): number | undefined {
  if (g === undefined) return undefined;
  return g < 10 ? Math.round(g * 10) / 10 : Math.round(g);
}
export function ratingFrom(verdict?: Rating): BakeCardRating { return verdict; }
export type BakeCardRating = Rating | undefined;
```

- [ ] **Step 2: Write the failing parity test**

```ts
// lib/viewmodel/bakeCard.test.ts
import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "../source/db";
import { buildBakeCard } from "./bakeCard";

async function svc() { return serviceFrom(await buildRepository(fixture as any)); }

describe("buildBakeCard", () => {
  it("matches core macros exactly (parity) and carries dual-unit grams", async () => {
    const s = await svc();
    const v = (await s.listVersions()).find((x) => x.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
    const core = await s.exportCard(v.id);
    const card = await buildBakeCard(s, v.recipeId);
    expect(card.perServing.calories).toBe(core.macros.perServing.calories);
    expect(card.whole.calories).toBe(core.macros.total.calories);
    expect(card.calPerGramProtein).toBe(core.macros.caloriesPerGramProtein ?? null);
    // dual units: at least one ingredient row has both a natural qty and grams
    const rows = card.ingredientGroups.flatMap((g) => g.items);
    expect(rows.some((r) => r.grams !== undefined && /cup|tbsp|scoop|tsp/.test(r.qtyNatural))).toBe(true);
    // grouped sub-recipe present (cream-cheese frosting)
    expect(card.ingredientGroups.some((g) => g.subRecipe)).toBe(true);
  });
});
```

- [ ] **Step 3: Run → fails.** Run: `pnpm --filter @batch/web test bakeCard`

- [ ] **Step 4: Implement `lib/viewmodel/bakeCard.ts`**

```ts
import type { RecipeService } from "@batch/core";
import type { BakeCardVM, IngredientGroupVM, MacroVM } from "./types";
import { qtyNatural, roundGrams } from "./format";
import { summarizeRecipe } from "@batch/core";

const macroVM = (m: { calories: number; protein: number; carbs: number; fat: number; fiber: number }): MacroVM => ({
  calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber,
});

export async function buildBakeCard(svc: RecipeService, recipeId: string): Promise<BakeCardVM> {
  const recipe = await svc.getRecipe(recipeId);
  const headId = recipe.headVersionId;
  const { version, content, macros } = await svc.exportCard(headId);
  const { bySection } = await svc.macrosBySection(headId);

  // Ingredient groups (dual units): zip flattened usages[i] <-> macros.lines[i],
  // group by the section of the step each usage belongs to.
  const slotByKey = new Map(content.slots.map((s) => [s.componentKey, s] as const));
  const sectionOfStep = new Map(content.steps.map((s) => [s.componentKey, s.section ?? "Base"] as const));
  const groups = new Map<string, IngredientGroupVM>();
  content.usages.forEach((u, i) => {
    const line = macros.lines[i];
    const slot = slotByKey.get(u.slotKey);
    const section = sectionOfStep.get(u.stepKey) ?? "Base";
    const isSub = / · sub-recipe$/i.test(section) || section !== "Base" && /frosting|crust|caramel|ganache|swirl/i.test(section);
    const g = groups.get(section) ?? { title: section.replace(/ · sub-recipe$/i, ""), subRecipe: /sub-recipe/i.test(section), calories: 0, items: [] };
    g.calories += line?.macros?.calories ?? 0;
    g.items.push({ qtyNatural: qtyNatural(u.quantityValue, u.quantityUnit), grams: roundGrams(line?.grams), name: slot?.name ?? line?.ingredientName ?? u.slotKey });
    groups.set(section, g);
  });
  for (const g of groups.values()) g.calories = Math.round(g.calories);

  const feedback = await svc.feedbackForRecipe(recipeId);
  const summary = summarizeRecipe(feedback);

  return {
    recipeId, versionId: version.id, shortSha: version.id.slice(0, 6),
    name: version.name, description: version.description, tags: version.tags,
    made: summary.tried, rating: summary.verdict, queued: summary.queued,
    yield: version.yield,
    perServing: macroVM(macros.perServing), whole: macroVM(macros.total),
    calPerGramProtein: macros.caloriesPerGramProtein ?? null, basis: macros.basis,
    ingredientGroups: [...groups.values()],
    composition: Object.entries(bySection).map(([name, m]) => ({ name: name.replace(/ · sub-recipe$/i, ""), calories: Math.round(m.calories), protein: Math.round(m.protein * 10) / 10 })),
    lineage: await buildLineage(svc, version),
    method: buildMethod(content),
    tastingLog: feedback.map((e) => ({ kind: e.kind, rating: e.kind === "made" ? e.rating : undefined, date: e.date.slice(0, 10), note: e.notes, component: e.componentKey })),
  };
}

async function buildLineage(svc: RecipeService, version: import("@batch/core").RecipeVersion) {
  const out: BakeCardVM["lineage"] = [];
  if (version.derivesFromVersionId) {
    const base = await svc.getVersion(version.derivesFromVersionId);
    out.push({ name: base.name, rel: "forked-from", recipeId: base.recipeId });
  }
  for (const slot of version.content.slots) {
    if (slot.resolution.kind === "sub_recipe") {
      const sub = await svc.getVersion(slot.resolution.subRecipeVersionId);
      out.push({ name: sub.name, rel: "composes", recipeId: sub.recipeId });
    }
  }
  return out;
}

function buildMethod(content: import("@batch/core").RecipeContent): BakeCardVM["method"] {
  const bySection = new Map<string, BakeCardVM["method"][number]["steps"]>();
  for (const s of [...content.steps].sort((a, b) => a.order - b.order)) {
    const sec = (s.section ?? "Method").replace(/ · sub-recipe$/i, "");
    const arr = bySection.get(sec) ?? [];
    arr.push({ text: s.instructionText, tempF: s.temperature, minutes: s.timerSeconds ? Math.round(s.timerSeconds / 60) : undefined });
    bySection.set(sec, arr);
  }
  return [...bySection.entries()].map(([section, steps]) => ({ section, steps }));
}
```

- [ ] **Step 5: Run → passes.** Run: `pnpm --filter @batch/web test bakeCard`

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/viewmodel/format.ts packages/web/lib/viewmodel/bakeCard.ts packages/web/lib/viewmodel/bakeCard.test.ts
git commit -m "feat(web): bake-card view-model (macro parity + dual-unit ingredients) (TDD)"
```

### Task 7: Tree graph adapter (TDD — edges + bake-off)

**Files:**
- Create: `lib/viewmodel/treeGraph.ts`, `lib/viewmodel/treeGraph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/viewmodel/treeGraph.test.ts
import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { buildRepository, serviceFrom } from "../source/db";
import { buildTreeGraph } from "./treeGraph";

describe("buildTreeGraph", () => {
  it("emits a derive edge from the Crumbl-base red velvet to the Crumbl base", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    const rvA = g.nodes.find((n) => n.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
    const base = g.nodes.find((n) => n.name === "Crumbl Base Protein Cookie")!;
    expect(g.edges.some((e) => e.from === rvA.recipeId && e.to === base.recipeId && e.rel === "derives")).toBe(true);
  });
  it("emits compose edges from both red velvets to the cream-cheese frosting", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    const frosting = g.nodes.find((n) => n.name === "Protein Cream-Cheese Frosting")!;
    const composers = g.edges.filter((e) => e.to === frosting.recipeId && e.rel === "composes");
    expect(composers.length).toBeGreaterThanOrEqual(2);
  });
  it("detects the red velvet bake-off pair", async () => {
    const svc = serviceFrom(await buildRepository(fixture as any));
    const g = await buildTreeGraph(svc);
    expect(g.bakeoffs.some((b) => b.note.a.name.includes("Red Velvet") && b.note.b.name.includes("Red Velvet"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fails.** Run: `pnpm --filter @batch/web test treeGraph`

- [ ] **Step 3: Implement `lib/viewmodel/treeGraph.ts`**

```ts
import type { RecipeService, RecipeVersion } from "@batch/core";
import type { RecipeSummary, TreeEdgeVM, TreeGraphVM, TreeNodeVM, BakeoffVM } from "./types";

const FAMILY_TAGS = ["cheesecake", "crumbl", "browned-butter", "nanaimo", "frosting", "crust"];
function familyOf(v: RecipeVersion): string {
  const t = v.tags.find((x) => FAMILY_TAGS.includes(x));
  if (t === "crumbl") return "Crumbl Cookies";
  if (t === "cheesecake") return "Cheesecake";
  if (t === "browned-butter") return "Browned-Butter";
  if (t === "frosting") return "Frostings";
  if (t === "crust") return "Crusts";
  return "Singles & No-bake";
}
function nameStem(name: string): string { return name.replace(/\s*\([^)]*\)\s*$/, "").trim(); }

async function summarize(svc: RecipeService): Promise<{ heads: RecipeVersion[]; nodes: TreeNodeVM[] }> {
  const recipes = await svc.listRecipes();
  const fb = await svc.feedbackSummary();
  const heads = await Promise.all(recipes.map((r) => svc.getVersion(r.headVersionId)));
  const headByRecipe = new Map(heads.map((v) => [v.recipeId, v] as const));
  // a recipe is a "base" if some other head derives from it
  const isBase = new Set<string>();
  for (const v of heads) if (v.derivesFromVersionId) {
    const baseV = heads.find((h) => h.id === v.derivesFromVersionId) ?? await svc.getVersion(v.derivesFromVersionId);
    isBase.add(baseV.recipeId);
  }
  const nodes: TreeNodeVM[] = await Promise.all(heads.map(async (v) => {
    const m = v.macros!; const sum = fb[v.recipeId] ?? { tried: false, queued: false };
    const isSub = v.tags.includes("sub-recipe");
    const kind: RecipeSummary["kind"] = isSub ? "sub-recipe" : v.derivesFromVersionId ? "variant" : isBase.has(v.recipeId) || v.tags.includes("base") ? "base" : "root";
    const made = sum.tried; const fbEntries = await svc.feedbackForRecipe(v.recipeId);
    const latestMade = fbEntries.find((e) => e.kind === "made");
    return {
      recipeId: v.recipeId, versionId: v.id, name: v.name, tags: v.tags, kind, family: familyOf(v),
      cal: Math.round(m.perServing.calories), protein: Math.round(m.perServing.protein * 10) / 10,
      calPerGramProtein: m.caloriesPerGramProtein ?? null,
      servings: v.yield.amount, servingUnit: v.yield.unit,
      made, rating: sum.verdict, queued: sum.queued,
      feedbackNote: latestMade?.notes, needsTuning: v.tags.includes("needs-tuning"),
    };
  }));
  return { heads, nodes };
}

export async function buildSummaries(svc: RecipeService): Promise<RecipeSummary[]> {
  return (await summarize(svc)).nodes;
}

export async function buildTreeGraph(svc: RecipeService): Promise<TreeGraphVM> {
  const { heads, nodes } = await summarize(svc);
  const recipeOfVersion = new Map<string, string>();
  for (const v of await svc.listVersions()) recipeOfVersion.set(v.id, v.recipeId);

  const edges: TreeEdgeVM[] = [];
  for (const v of heads) {
    if (v.derivesFromVersionId) {
      const to = recipeOfVersion.get(v.derivesFromVersionId);
      if (to) edges.push({ from: v.recipeId, to, rel: "derives" });
    }
    for (const slot of v.content.slots) {
      if (slot.resolution.kind === "sub_recipe") {
        const to = recipeOfVersion.get(slot.resolution.subRecipeVersionId);
        if (to && to !== v.recipeId) edges.push({ from: v.recipeId, to, rel: "composes" });
      }
    }
  }

  // bake-off: a stem family that is EXACTLY two untried siblings awaiting a head-to-head
  // verdict. Deliberately the strictest, lowest-false-positive rule: it flags Red Velvet
  // (family = {Oat, Crumbl}, both to-make) and refuses to guess on larger families — e.g.
  // Browned-Butter has 4 siblings incl. a 50g/60g *ablation sweep* (a concept the user keeps
  // SEPARATE from bake-offs), correctly NOT flagged. A name heuristic can't itself tell a
  // bake-off from an ablation; the robust answer is explicit bake-off metadata once arms exist.
  const byStem = new Map<string, TreeNodeVM[]>();
  for (const n of nodes) { const k = nameStem(n.name); (byStem.get(k) ?? byStem.set(k, []).get(k)!).push(n); }
  const bakeoffs: BakeoffVM[] = [];
  for (const group of byStem.values()) {
    if (group.length === 2 && group.every((n) => !n.made)) {
      const [a, b] = group;
      const cmp = await svc.compare([a.versionId, b.versionId]);
      const differing = cmp.ingredients.filter((r) => r.perServingGrams[a.versionId] !== r.perServingGrams[b.versionId])
        .map((r) => ({ name: r.name, a: r.perServingGrams[a.versionId] ?? null, b: r.perServingGrams[b.versionId] ?? null }));
      bakeoffs.push({ a: a.recipeId, b: b.recipeId, note: {
        a: { name: a.name, cal: a.cal, calPerGramProtein: a.calPerGramProtein, servings: a.servings },
        b: { name: b.name, cal: b.cal, calPerGramProtein: b.calPerGramProtein, servings: b.servings },
        differingIngredients: differing.slice(0, 8),
      }});
    }
  }
  return { nodes, edges, bakeoffs };
}
```

- [ ] **Step 4: Run → passes.** Run: `pnpm --filter @batch/web test treeGraph`

- [ ] **Step 5: Wire `StaticRecipeSource` builders (replace the stubs from Task 5) and run its test.** Run: `pnpm --filter @batch/web test StaticRecipeSource` → passes.

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/viewmodel/treeGraph.ts packages/web/lib/viewmodel/treeGraph.test.ts packages/web/lib/source/StaticRecipeSource.ts
git commit -m "feat(web): tree-graph view-model — derive/compose edges + bake-off detection (TDD)"
```

---

## Phase 2 — Shared UI, fonts, layout

### Task 8: Root layout, fonts, TopBar

**Files:**
- Modify: `app/layout.tsx`
- Create: `components/shared/TopBar.tsx`, `styles/topbar.module.css`

- [ ] **Step 1: Write `app/layout.tsx`** (fonts via next/font, tokens, TopBar)

```tsx
import "../styles/tokens.css";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { TopBar } from "../components/shared/TopBar";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-serif" });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = { title: "Batch", description: "git for recipes" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>
      <body><TopBar /><div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 30px 60px" }}>{children}</div></body>
    </html>
  );
}
```
(Update `tokens.css` to set `--serif: var(--font-serif), Georgia, serif;` etc. so next/font wins.)

- [ ] **Step 2: Write `components/shared/TopBar.tsx`** porting the `.topbar` markup from `design-reference/tree.html` (brand, `main` chip, Tree/Recipes/Index nav as `next/link`, search, avatar). Move `.topbar*` CSS into `styles/topbar.module.css`.

- [ ] **Step 3: Verify build boots.** Run: `pnpm --filter @batch/web build` (will bake data — ensure `~/.batch/db.json` exists). Expected: build succeeds, `/` renders the TopBar.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/layout.tsx packages/web/components/shared/TopBar.tsx packages/web/styles
git commit -m "feat(web): root layout with fonts, tokens, TopBar"
```

### Task 9: Shared MacroLine, RatingChip, StateDot

**Files:**
- Create: `components/shared/MacroLine.tsx`, `RatingChip.tsx`, `StateDot.tsx`, `components/shared/shared.test.tsx`, `styles/shared.module.css`

- [ ] **Step 1: Write the failing render test**

```tsx
// components/shared/shared.test.tsx
import { render, screen } from "@testing-library/react";
import { MacroLine } from "./MacroLine";
import { RatingChip } from "./RatingChip";

it("MacroLine shows cal, protein, ratio, servings", () => {
  render(<MacroLine cal={205} protein={17.8} calPerGramProtein={11.5} servings={6} unit="cookies" />);
  expect(screen.getByText(/205 cal/)).toBeTruthy();
  expect(screen.getByText(/17.8 P/)).toBeTruthy();
  expect(screen.getByText(/makes 6/)).toBeTruthy();
});
it("RatingChip renders excellent as a star", () => {
  render(<RatingChip rating="excellent" made />);
  expect(screen.getByText(/excellent/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run → fails.** Run: `pnpm --filter @batch/web test shared`

- [ ] **Step 3: Implement the three components** (port the `.nmeta` / `.nrate` / dot styles from `design-reference/tree.html`):

```tsx
// components/shared/MacroLine.tsx
export function MacroLine({ cal, protein, calPerGramProtein, servings, unit }: {
  cal: number; protein: number; calPerGramProtein: number | null; servings: number; unit: string;
}) {
  return (<div className="macroline">{cal} cal · {protein} P · {calPerGramProtein ?? "—"} cal/g · makes {servings}</div>);
}
```
```tsx
// components/shared/RatingChip.tsx
const LABEL = { excellent: "★ excellent", good: "good", okay: "okay", bad: "needs work" } as const;
export function RatingChip({ rating, made }: { rating?: "bad"|"okay"|"good"|"excellent"; made: boolean }) {
  if (!made) return <span className="rate plan">○ to make</span>;
  return <span className={`rate ${rating ?? "good"}`}>{rating ? LABEL[rating] : "made"}</span>;
}
```
```tsx
// components/shared/StateDot.tsx
export function StateDot({ made, rating }: { made: boolean; rating?: string }) {
  if (!made) return <span className="ringa" aria-label="to-make" />;
  if (rating === "excellent") return <span className="star" aria-label="excellent">★</span>;
  return <span className="dotg" aria-label="made" />;
}
```

- [ ] **Step 4: Run → passes.** Run: `pnpm --filter @batch/web test shared`

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/shared packages/web/styles/shared.module.css
git commit -m "feat(web): shared MacroLine / RatingChip / StateDot (TDD)"
```

---

## Phase 3 — Bake Card page

### Task 10: Bake Card route + assembly

**Files:**
- Create: `app/r/[recipeId]/page.tsx`, `components/card/*`, `styles/card.module.css`, `app/r/[recipeId]/page.test.tsx`

- [ ] **Step 1: Write `app/r/[recipeId]/page.tsx`** (server component: builds the VM at build time, renders card components)

```tsx
import { loadDb } from "../../../lib/source/db";
import { StaticRecipeSource } from "../../../lib/source/StaticRecipeSource";
import { RecipeHero } from "../../../components/card/RecipeHero";
import { IngredientList } from "../../../components/card/IngredientList";
import { CompositionRollup } from "../../../components/card/CompositionRollup";
import { Lineage } from "../../../components/card/Lineage";
import { TastingLog } from "../../../components/card/TastingLog";
import { Method } from "../../../components/card/Method";

export async function generateStaticParams() {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  return (await src.listRecipes()).map((r) => ({ recipeId: r.recipeId }));
}

export default async function Page({ params }: { params: { recipeId: string } }) {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  const card = await src.getBakeCard(params.recipeId);
  return (
    <main>
      <RecipeHero card={card} />
      <div className="cardGrid">
        <aside>
          <IngredientList groups={card.ingredientGroups} />
          <CompositionRollup rows={card.composition} whole={card.whole} perServing={card.perServing} servings={card.yield.amount} />
          <Lineage items={card.lineage} />
          <TastingLog entries={card.tastingLog} />
        </aside>
        <Method sections={card.method} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Implement the six card components**, porting markup + CSS from `design-reference/red-velvet.html` 1:1, fed by props:
  - `RecipeHero` — title (Fraunces + parenthetical `.q`), `shortSha · main` hash line, status chip (`RatingChip`), tags, description, macro bar (perServing big numbers + whole-batch sub-line), `basis` note if partial.
  - `IngredientList` — for each `IngredientGroupVM`: group header + per-group `calories`; each item row = `qtyNatural` (left, mono accent) · `name` · `grams && \`${grams} g\`` (right, faint). **Dual units** come straight from the VM. Spell "scoop" — already spelled in the VM.
  - `CompositionRollup` — `composition[]` rows → whole-batch total → per-serving (the `.ctbl`).
  - `Lineage` — `lineage[]` rows with `forked-from`/`composes`/`sibling` icons, each a `next/link` to `/r/${recipeId}` when present.
  - `TastingLog` — entries; `to-make` rendered as the amber ring + "To make"; made entries with rating + date + note; component-scoped note styled distinctly.
  - `Method` — `method[]` sections (sub-recipes first if their section names differ from "Method"); each step with optional `tempF`/`minutes` chips (`350°F · 9 min`).

- [ ] **Step 3: Write the page smoke test**

```tsx
// app/r/[recipeId]/page.test.tsx
import { render, screen } from "@testing-library/react";
import fixture from "../../../test/fixtures/db.fixture.json";
import { StaticRecipeSource } from "../../../lib/source/StaticRecipeSource";
import { RecipeHero } from "../../../components/card/RecipeHero";
import { IngredientList } from "../../../components/card/IngredientList";

it("renders the red velvet card hero + dual-unit ingredient", async () => {
  const src = await StaticRecipeSource.fromDb(fixture as any);
  const list = await src.listRecipes();
  const rv = list.find((r) => r.name === "Red Velvet Protein Cookies (Crumbl Base)")!;
  const card = await src.getBakeCard(rv.recipeId);
  render(<><RecipeHero card={card} /><IngredientList groups={card.ingredientGroups} /></>);
  expect(screen.getByText(/Red Velvet/)).toBeTruthy();
  expect(screen.getByText(/180 g/)).toBeTruthy(); // 0.75 cup yogurt -> 180 g
});
```

- [ ] **Step 4: Run → passes.** Run: `pnpm --filter @batch/web test page`

- [ ] **Step 5: Visual check + commit.** Run `pnpm --filter @batch/web dev`, open `/r/<a recipeId>`, compare to `design-reference/red-velvet.html`.

```bash
git add packages/web/app/r packages/web/components/card packages/web/styles/card.module.css
git commit -m "feat(web): bake card page + components (dual units, flattened sub-recipes, tasting log)"
```

---

## Phase 4 — Tree page

### Task 11: Graph layout (TDD — deterministic, all nodes placed)

**Files:**
- Create: `lib/layout/graphLayout.ts`, `lib/layout/graphLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/layout/graphLayout.test.ts
import { describe, it, expect } from "vitest";
import { layoutGraph } from "./graphLayout";

const g = { nodes: [
  { recipeId: "base", kind: "base" }, { recipeId: "v1", kind: "variant" }, { recipeId: "sub", kind: "sub-recipe" },
] as any, edges: [ { from: "v1", to: "base", rel: "derives" }, { from: "v1", to: "sub", rel: "composes" } ] as any };

it("places every node with finite coords, deterministically", () => {
  const a = layoutGraph(g); const b = layoutGraph(g);
  expect(a.size).toBe(3);
  for (const p of a.values()) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
  expect([...a.entries()]).toEqual([...b.entries()]); // determinism (no Math.random/Date)
});
```

- [ ] **Step 2: Run → fails.** Run: `pnpm --filter @batch/web test graphLayout`

- [ ] **Step 3: Implement `lib/layout/graphLayout.ts`** (pure dagre wrapper)

```ts
import dagre from "@dagrejs/dagre";
import type { TreeGraphVM } from "../viewmodel/types";

export interface Pos { x: number; y: number; w: number; h: number; }
const NODE_W = 200, NODE_H = 96;

/** Left→right DAG. Derive edges set rank; compose edges are included (lower weight) so subs sit near their composer. */
export function layoutGraph(g: Pick<TreeGraphVM, "nodes" | "edges">): Map<string, Pos> {
  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 130, marginx: 24, marginy: 24 });
  dg.setDefaultEdgeLabel(() => ({}));
  for (const n of g.nodes) dg.setNode(n.recipeId, { width: NODE_W, height: NODE_H });
  // derive edge variant->base means base is the parent rank: add base->variant for LR flow
  for (const e of g.edges) {
    if (e.rel === "derives") dg.setEdge(e.to, e.from, { weight: 3 });
    else dg.setEdge(e.from, e.to, { weight: 1, minlen: 1 });
  }
  dagre.layout(dg);
  const out = new Map<string, Pos>();
  for (const id of dg.nodes()) { const n = dg.node(id); out.set(id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2, w: NODE_W, h: NODE_H }); }
  return out;
}
```

- [ ] **Step 4: Run → passes.** Run: `pnpm --filter @batch/web test graphLayout`

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/layout
git commit -m "feat(web): deterministic dagre graph layout (TDD)"
```

### Task 12: EdgeLayer (inheritance ▷ / composition ◇ markers)

**Files:**
- Create: `components/tree/EdgeLayer.tsx`

- [ ] **Step 1: Implement `EdgeLayer`** — an SVG sized to the laid-out bounds. Port the `<defs>` markers (`m-tri` hollow triangle, `m-dia` hollow diamond) and edge styling verbatim from `design-reference/tree.html`. For each edge, draw a cubic path between the two nodes' anchor points (derive: variant-edge → base-edge, `marker-end="url(#m-tri)"`, solid toffee; composes: composer-edge → sub-edge, `marker-start="url(#m-dia)"`, dashed muted). Anchor points computed from the `Pos` map (right/left/top/bottom midpoints by relative position).

```tsx
export function EdgeLayer({ edges, pos, width, height }: {
  edges: { from: string; to: string; rel: "derives" | "composes" }[];
  pos: Map<string, { x: number; y: number; w: number; h: number }>; width: number; height: number;
}) {
  const anchor = (id: string, side: "l"|"r"|"c") => { const p = pos.get(id)!; return side==="l"?{x:p.x,y:p.y+p.h/2}:side==="r"?{x:p.x+p.w,y:p.y+p.h/2}:{x:p.x+p.w/2,y:p.y+p.h/2}; };
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <defs>{/* paste m-tri + m-dia markers from design-reference/tree.html */}</defs>
      {edges.map((e, i) => {
        const a = anchor(e.from, "c"), b = anchor(e.to, "c");
        const d = `M${a.x},${a.y} C${(a.x+b.x)/2},${a.y} ${(a.x+b.x)/2},${b.y} ${b.x},${b.y}`;
        return e.rel === "derives"
          ? <path key={i} d={d} fill="none" stroke="#B47A37" strokeWidth={1.5} markerEnd="url(#m-tri)" />
          : <path key={i} d={d} fill="none" stroke="#8C8474" strokeWidth={1.4} strokeDasharray="5 4" markerStart="url(#m-dia)" />;
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck.** Run: `pnpm --filter @batch/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/tree/EdgeLayer.tsx
git commit -m "feat(web): SVG edge layer with UML inheritance/composition markers"
```

### Task 13: RecipeNode

**Files:**
- Create: `components/tree/RecipeNode.tsx`

- [ ] **Step 1: Implement `RecipeNode`** porting the `.node` card from `design-reference/tree.html`: role label (kind, + `· A`/`· B` for bake-off arms passed via prop), Fraunces name (+ parenthetical), `MacroLine`, `RatingChip`, optional `feedbackNote` (`.nfb`, `bad` variant when `needsTuning`), `sub` dashed styling for `kind==="sub-recipe"`, `cur` highlight when `selected`. Absolutely positioned from `Pos`. `onClick` → navigate to `/r/${recipeId}` (via `next/link` wrapper).

- [ ] **Step 2: Render smoke test** (renders name, macro line, rating). Run: `pnpm --filter @batch/web test RecipeNode`

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/tree/RecipeNode.tsx
git commit -m "feat(web): RecipeNode card (macro line, rating, feedback, sub styling)"
```

### Task 14: TreeCanvas (pan / zoom / fit) — client component

**Files:**
- Create: `components/tree/TreeCanvas.tsx`, `styles/tree.module.css`

- [ ] **Step 1: Implement `TreeCanvas`** (`"use client"`) — receives the `TreeGraphVM` + precomputed `Pos` map (serializable) as props. Owns the pan/zoom transform. Port the proven interaction from `design-reference/tree.html`'s `<script>`: drag-to-pan (ignore drags starting on a node), wheel-zoom around cursor (clamp 0.35–2), `Fit` (rescale+center to viewport). Renders `<EdgeLayer/>` under absolutely-positioned `<RecipeNode/>`s inside a transformed `.scene`. Dot-grid background on `.scene`.

```tsx
"use client";
import { useRef, useState } from "react";
import { EdgeLayer } from "./EdgeLayer";
import { RecipeNode } from "./RecipeNode";
import type { TreeGraphVM } from "../../lib/viewmodel/types";
import type { Pos } from "../../lib/layout/graphLayout";

export function TreeCanvas({ graph, pos, width, height }: {
  graph: TreeGraphVM; pos: Record<string, Pos>; width: number; height: number;
}) {
  const [t, setT] = useState({ x: 24, y: 8, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const posMap = new Map(Object.entries(pos));
  // pan: onMouseDown (skip .node), onMouseMove, onMouseUp; zoom: onWheel around cursor; Fit button → setT
  return (
    <div className="boardwrap" /* handlers here */>
      <div className="scene" style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.k})`, transformOrigin: "0 0", width, height }}>
        <EdgeLayer edges={graph.edges} pos={posMap} width={width} height={height} />
        {graph.nodes.map((n) => <RecipeNode key={n.recipeId} node={n} pos={posMap.get(n.recipeId)!} />)}
        {/* BakeoffPill(s) positioned at the midpoint between each bakeoff pair */}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + manual pan/zoom check in `dev`.** Run: `pnpm --filter @batch/web typecheck`

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/tree/TreeCanvas.tsx packages/web/styles/tree.module.css
git commit -m "feat(web): pannable/zoomable TreeCanvas client component"
```

### Task 15: TreeOutline, Legend, CanvasControls, BakeoffPill

**Files:**
- Create: `components/tree/TreeOutline.tsx`, `Legend.tsx`, `CanvasControls.tsx`, `BakeoffPill.tsx`

- [ ] **Step 1: `TreeOutline`** (`"use client"`) — the navigable, collapsible outline grouped by family → base → variants, each leaf with a `StateDot`; click a row → focus that node (lift state to the Tree page or via a small context). Togglable (Hide/Show via `CanvasControls`). Port `.tree-ol` markup/CSS from `design-reference/tree.html`.

- [ ] **Step 2: `Legend`** (inherits ▷ / composes ◇ / bake-off / rating glyphs) and **`CanvasControls`** (Fit, Hide/Show tree) — port from reference.

- [ ] **Step 3: `BakeoffPill`** (`"use client"`) — the pill with hover note built from `BakeoffNote` (A vs B lines + differing ingredients + macro deltas). Port `.bopill`/`.bonote` from reference; feed real data from the VM.

- [ ] **Step 4: Smoke test** TreeOutline renders families + leaves. Run: `pnpm --filter @batch/web test TreeOutline`

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/tree/TreeOutline.tsx packages/web/components/tree/Legend.tsx packages/web/components/tree/CanvasControls.tsx packages/web/components/tree/BakeoffPill.tsx
git commit -m "feat(web): tree outline, legend, controls, bake-off hover note"
```

### Task 16: Tree page assembly

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement `app/page.tsx`** (server component): build the `TreeGraphVM`, run `layoutGraph` to a `Pos` map + bounds, pass serialized to `<TreeCanvas>` + `<TreeOutline>`.

```tsx
import { loadDb } from "../lib/source/db";
import { StaticRecipeSource } from "../lib/source/StaticRecipeSource";
import { layoutGraph } from "../lib/layout/graphLayout";
import { TreeCanvas } from "../components/tree/TreeCanvas";
import { TreeOutline } from "../components/tree/TreeOutline";
import { Legend } from "../components/tree/Legend";

export default async function Page() {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  const graph = await src.getTreeGraph();
  const posMap = layoutGraph(graph);
  const pos = Object.fromEntries(posMap);
  const width = Math.max(...[...posMap.values()].map((p) => p.x + p.w)) + 40;
  const height = Math.max(...[...posMap.values()].map((p) => p.y + p.h)) + 40;
  return (
    <main>
      <div className="treeWrap">
        <TreeOutline graph={graph} />
        <div><Legend /><TreeCanvas graph={graph} pos={pos} width={width} height={height} /></div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build + visual check** against `design-reference/tree.html`. Run: `pnpm --filter @batch/web build && pnpm --filter @batch/web start`, open `/`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/page.tsx
git commit -m "feat(web): tree page assembling canvas + outline from real data"
```

---

## Phase 5 — Index, build, deploy, seam note

### Task 17: Recipes index page

**Files:**
- Create: `app/index/page.tsx`, `components/IndexTable.tsx`

- [ ] **Step 1: Implement** a server page that lists `src.listRecipes()` in a filterable (client) table: name (link to card), family, macros (`MacroLine`), state (`StateDot`). Filter by name/tag client-side.

- [ ] **Step 2: Smoke test** renders ≥1 row linking to `/r/...`. Run: `pnpm --filter @batch/web test Index`

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/index packages/web/components/IndexTable.tsx
git commit -m "feat(web): recipes index (filterable catalog)"
```

### Task 18: Deploy config + no-rewrite README

**Files:**
- Create: `packages/web/vercel.json`, `packages/web/README.md`, `.github/workflows/web-deploy.yml` (in the data repo — documented, not committed here)

- [ ] **Step 1: `vercel.json`** — set the build command to run from the monorepo root with the web filter:

```json
{ "buildCommand": "pnpm --filter @batch/web build", "outputDirectory": "packages/web/.next", "installCommand": "pnpm install" }
```

- [ ] **Step 2: `README.md`** — document: (a) `BATCH_DB` overrides the data source; (b) local dev = `pnpm --filter @batch/web dev` after a bake; (c) **the no-rewrite path**: writes become methods on `RecipeSource`, implemented against the same `@batch/core` mutations (`derive`/`applyOverride`/`editMetadata`/`addFeedback`/`promote`/`rebase`) behind a Next route handler; pages don't change because they depend only on the seam + view-models. (d) CI: a data-repo push fires a Vercel deploy hook with a read-only deploy key that bakes `db.json`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/vercel.json packages/web/README.md
git commit -m "docs(web): deploy config + no-rewrite write-path note"
```

### Task 19: Final verification

- [ ] **Step 1: Full build from the real store.** Run: `pnpm --filter @batch/web build`. Expected: bakes `~/.batch/db.json`, SSG generates `/`, `/index`, and `/r/[recipeId]` for every recipe with no errors.
- [ ] **Step 2: Parity spot-check.** Run `pnpm --filter @batch/web test` — all view-model parity tests green. Manually: Turtle card per-slice macros == `./batch --human macros <turtle>`.
- [ ] **Step 3: Visual diff.** `start` the build; compare `/` to `design-reference/tree.html` and a card to `design-reference/red-velvet.html` (fonts, toffee accent, inheritance/composition edges, bake-off hover, dual-unit ingredients).
- [ ] **Step 4: Typecheck whole repo.** Run: `pnpm -r typecheck`. Expected: clean.
- [ ] **Step 5: Commit any fixes; the branch is ready for review/deploy.**

---

## Self-Review (completed)

**Spec coverage:** Bake Card (Tasks 6,10), Tree with pan/zoom/outline/edges/bake-off (Tasks 7,11–16), dual-unit ingredients (Task 6/10), ratings+feedback on tree (Task 7/13), macro parity (Tasks 6,19), RecipeSource seam with declared writes (Tasks 5,18), hosting/bake/deploy (Tasks 3,18), recipeId URLs (Task 10). Subgraph-investigate is intentionally deferred (spec §1) — outline focus (Task 15) is the v1 hook.

**Placeholder scan:** UI-porting steps reference `design-reference/*.html` — a real committed artifact (Task 2), not a TODO. The `EdgeLayer` `<defs>` and several `.module.css` files say "port from reference"; that content exists in the reference file. No "TBD"/"implement later".

**Type consistency:** `BakeCardVM`/`TreeGraphVM`/`RecipeSummary`/`BakeoffNote` are defined once (Task 5) and consumed unchanged by adapters (6–7), components (9–15), and pages (10,16). `Pos` defined in Task 11 (`graphLayout.ts`), consumed by EdgeLayer/TreeCanvas (12,14). Service method names (`exportCard`, `macrosBySection`, `feedbackForRecipe`, `feedbackSummary`, `compare`, `getVersion`, `getRecipe`, `listVersions`) all verified against `packages/core/src/recipe-service.ts`.

**Known judgment calls (flag in review):** (1) bake-off detection is heuristic (name-stem + both-untried) — fine for the red-velvet case, becomes explicit metadata later; (2) sub-recipe section detection in `bakeCard.ts` uses a name regex — robust alternative is to check each step's source via `flatten()` `sources[]`; (3) `app/**/*.test.tsx` render Server Components by calling the source directly then rendering child components (not the async page) to stay in jsdom.

---

## Adversarial Review (2026-06-18) — findings applied

Four parallel source/data audits ran against `packages/core/src` and the real `~/.batch/db.json`. Outcomes:

- **Blocker fixed — ESM resolution.** `@batch/core` is raw ESM-TS (`.js` specifiers on `.ts` files, no build, no `exports`). `transpilePackages` alone fails `next build`. Fix applied in `next.config.mjs` via `webpack.resolve.extensionAlias` (isolated to `packages/web`; does NOT touch the shared `tsconfig.base.json`, which would have hit core+CLI). Task 1 Step 7b now proves it with a real build before anything else is built on top.
- **Field vocabulary — verified 100% correct** against both the TS types and the serialized JSON. `version.yield = {amount,unit}` lives on the version; `usage = {componentKey,stepKey,slotKey,quantityValue,quantityUnit}`; `step` has optional `section/temperature/timerSeconds` (so non-composed recipes collapse to one "Base"/"Method" group — expected); feedback entries have optional `notes`/`componentKey` (so tree feedback snippets are sparse — expected, not a bug).
- **`v.macros` is persisted on every version** (set at commit) — the tree's `v.macros!` is safe, no crash.
- **Macro parity zip proven** — `exportCard` flattens then computes; one line per usage; sub-recipe expansion keeps `usages[i] ↔ lines[i]` aligned. Core's own `macrosBySection` relies on the same invariant.
- **Bake-off rule kept strict** (`group.length===2 && all-untried`) and documented inline — it cannot mislabel the Browned-Butter 50g/60g *ablation sweep* as a bake-off. Robust fix (explicit metadata) deferred.
- **Accepted minors:** tree reads stored `v.macros` while the card recomputes via `exportCard` (equal today; switch tree to computed if drift ever shows). The test fixture is the whole real store with a few hardcoded recipe names (verified exact); re-sync when recipes are renamed/added.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-batch-web-viewer.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review (spec-compliance then code-quality) between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
