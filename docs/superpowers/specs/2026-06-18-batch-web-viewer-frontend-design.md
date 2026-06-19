# Batch Web Viewer — Frontend Design Spec

**Status:** Draft for review · 2026-06-18
**Branch:** `web-viewer`
**Goal:** A read-only, always-online, hosted web app to view every recipe — full bake cards plus a navigable recipe graph — so William can reference recipes (macros, ingredients, steps) while baking. Built so that write operations (manual UI edits, agent chat, agent-driven changes) can be added later **without a rewrite**.

---

## 1. Scope

**In scope (v1, ship ASAP):**
- A hosted Next.js app rendering the real `~/.batch/db.json`.
- **Bake Card** page — the workhorse: full per-serving + whole-batch macros, every ingredient with **dual units (natural measure + grams)**, every step, composed sub-recipes flattened inline, lineage, and the tasting/feedback log.
- **Tree** page — a pannable / zoomable recipe graph with a togglable navigable outline; inheritance + composition edges; ratings + feedback on nodes; bake-off pill with a hover diff.
- Numbers identical to the CLI (same `@batch/core`).
- Read-only. The data is baked in at build time; a push to the data repo triggers a redeploy ("live").

**Explicitly out of scope (future increments — do NOT build now):**
- Any write path (manual UI edits, agent chat, agent-driven changes). The *interface* for writes is defined here so v1 doesn't have to be rewritten to add them — but no write code ships in v1.
- Auth / private gating (v1 is public — anyone with the link).
- Full-text search beyond a simple client-side name/tag filter.
- Real-time collaboration.

**Deferred-but-designed (may land v1.1):**
- **Select a subgraph and investigate** — focus a base + its descendants, dim the rest. Designed in §6 so the data/layout supports it; UI may ship in a fast follow.

---

## 2. Tech Stack

- **Next.js (App Router) + React + TypeScript.** SSG-first: every page is statically generated at build from the baked `db.json` (no server needed at request time → trivially "always online" and cheap).
- **Reuse `@batch/core` directly** via `transpilePackages: ['@batch/core']` in `next.config.mjs` (core is ESM TS source with no build step; Next compiles it). This is the macros-parity guarantee — the web computes nothing the CLI doesn't.
- **Styling:** plain CSS with the locked design tokens (CSS variables) via CSS Modules. No component/UI kit — the visual system is bespoke and already proven in the mockups. Fonts via `next/font` (Fraunces, JetBrains Mono, Inter).
- **Graph:** custom-light rendering (SVG edge layer + absolutely-positioned DOM node cards + a small pan/zoom transform hook) — ports the proven mockup directly and keeps total design control over the inheritance/composition markers. **Node layout is computed** by a DAG layout pass (`dagre`) so positions are not hand-placed. (Fallback considered: React Flow — rejected for v1 because matching the exact node/edge design fights its defaults; revisit only if dagre+custom proves insufficient.)
- **Hosting:** Vercel (first-class Next.js, push-to-deploy, preview URLs). Static export to Cloudflare/GitHub Pages is a viable alternative if we want fully static/no-vendor — kept open, Vercel recommended for speed.

---

## 3. Architecture (the layers)

```
db.json (baked at build)
      │
      ▼
@batch/core  ── FileRepository/InMemoryRepository + RecipeService
      │         (macros, flatten, compare, feedback summaries — identical to CLI)
      ▼
RecipeSource  ── the seam: read methods now; write methods declared, unimplemented
      │
      ▼
view-models   ── BakeCardVM, TreeGraphVM (plain serializable shapes)
      │
      ▼
React (Next App Router)  ── pages render view-models only
```

**Rule:** pages and components depend **only** on view-models and the `RecipeSource` interface — never on how data is fetched or persisted. Today the source is static (baked JSON); tomorrow it can be a live backend, and **the pages don't change**.

### 3.1 The `RecipeSource` seam (keystone)

```ts
// packages/web/lib/source/RecipeSource.ts
export interface RecipeSource {
  // ---- reads (v1 implements all of these) ----
  listRecipes(): Promise<RecipeSummary[]>;          // for the index + outline + tree
  getBakeCard(recipeId: string): Promise<BakeCardVM>;
  getTreeGraph(): Promise<TreeGraphVM>;
  compare(versionIds: string[]): Promise<CompareVM>; // powers the bake-off hover note
  getFeedback(recipeId: string): Promise<FeedbackVM>;

  // ---- writes (v1 DECLARES but does NOT implement — future increment) ----
  // Defining them now is the "no rewrite" guarantee: adding writes = implementing
  // these against the same @batch/core mutations the CLI uses, behind an API route.
  deriveRecipe?(...): Promise<never>;   // override/edit/derive/feedback/promote/rebase
  applyOverride?(...): Promise<never>;
  addFeedback?(...): Promise<never>;
}
```

- **v1 impl:** `StaticRecipeSource` — wraps `@batch/core`'s repository over the baked `db.json`, adapting service output into view-models. All write methods are absent/throw.
- **Future impl:** same interface, backed by an API route that calls the *same* `@batch/core` mutations (`derive`/`override`/`edit`/`feedback`/`promote`/`rebase`) and persists to the data repo. Manual UI edits and agent chat both route through here. **All mutation logic stays in `@batch/core`** so CLI + web + agent share one op set.

### 3.2 View-models (what components actually render)

```ts
export interface BakeCardVM {
  recipeId: string; versionId: string; shortSha: string;
  name: string; description: string; tags: string[];
  status: { made: boolean; rating?: 'bad'|'okay'|'good'|'excellent' };
  yield: { amount: number; unit: string };
  macros: { perServing: MacroVM; whole: MacroVM; calPerGramProtein?: number };
  ingredientGroups: Array<{                  // grouped by component/section
    title: string; subRecipe?: boolean; calories: number;
    items: Array<{ qtyNatural: string; grams?: number; name: string }>; // DUAL UNITS
  }>;
  composition: Array<{ name: string; calories: number; protein: number; isSub: boolean }>;
  lineage: Array<{ name: string; rel: 'forked-from'|'composes'|'sibling'; recipeId?: string }>;
  method: Array<{ section: string; steps: Array<{ text: string; tempF?: number; minutes?: number }> }>;
  tastingLog: Array<{ kind: 'made'|'to-make'; rating?: string; date: string; note?: string; component?: string }>;
}

export interface TreeGraphVM {
  nodes: Array<{
    recipeId: string; name: string; family: string;
    kind: 'base'|'variant'|'root'|'sub-recipe';
    macro: { cal: number; protein: number; calPerGramProtein: number; servings: number; unit: string };
    rating?: 'excellent'|'good'|'okay'|'bad'; made: boolean;
    feedbackNote?: string; needsTuning?: boolean;
    x: number; y: number; w: number; h: number;        // from the dagre layout pass
  }>;
  edges: Array<{ from: string; to: string; rel: 'derives'|'composes' }>;
  bakeoffs: Array<{ a: string; b: string; note: CompareSummary }>; // head-to-head pairs
}
```

The **adapter** that builds these from `@batch/core` is the only place macros/units/flatten are touched, and it is unit-tested for parity against the CLI (§9).

---

## 4. Data & Build Flow

1. **Bake step** (`scripts/bake-data.mjs`, run before `next build`): obtain `db.json` and write it to `packages/web/data/db.json`.
   - **Local dev:** copy from `$BATCH_DB` / `~/.batch/db.json`.
   - **CI:** the data repo (`git@github.com:WilliamJin123/batch-data.git`) is private → CI checks it out via a read-only deploy key and copies `db.json`. (Simpler fallback if the deploy key is friction: commit a periodic `db.json` snapshot into the web app and bake from that.)
2. **`next build`** → SSG renders `/`, `/r/[recipeId]` for every recipe, `/index`, from `db.json` through `StaticRecipeSource`.
3. **Deploy** to Vercel.
4. **"Live":** a push to the data repo triggers a redeploy (Vercel deploy hook fired by a data-repo CI action), so the site reflects new bakes/feedback/tunes without touching the web code.

`packages/web/data/db.json` is gitignored locally (it's baked); CI produces it fresh.

---

## 5. Routes & Pages

| Route | Page | Notes |
|---|---|---|
| `/` | **Tree** | Default landing. The graph canvas + togglable outline. |
| `/r/[recipeId]` | **Bake Card** | Stable URL by `recipeId` (survives version bumps). Name shown, not in URL. |
| `/index` | **Recipes list** | Simple filterable table (name/tags/macros/state) — the lightweight catalog. |

---

## 6. Components

### 6.1 Shared
- **`TopBar`** — brand, `main` branch chip, Tree/Recipes/Index nav, search affordance, avatar.
- **`MacroLine`** — `cal · protein · cal/g · makes N` (the locked node/hero format).
- **`RatingChip`** / **`StateDot`** — ★ excellent / ● good / ○ to-make, shared by tree + card + outline.
- **`tokens.css`** — the CSS-variable design system (see §7).

### 6.2 Bake Card (`/r/[recipeId]`)
- **`RecipeHero`** — Fraunces title (+ parenthetical qualifier), version meta (`<sha> · main · …`), status chip (made-rating or to-make ring), tags, description, macro bar (per-serving big numbers + whole-batch line).
- **`IngredientList`** — grouped by component/sub-recipe with per-group calories; each row shows **natural measure + grams** (e.g. `0.75 cup · 180 g`) and **"scoop" spelled out**. Grams come from the engine's per-line `grams`.
- **`CompositionRollup`** — sub-recipe macro roll-up table → whole batch → per serving.
- **`Lineage`** — forked-from / composes / sibling rows, each a link to that recipe's card.
- **`TastingLog`** — entries with rating/date/note; to-make rendered as the amber ring.
- **`Method`** — sub-recipes flattened first ("make these"), then the recipe's steps; temp/time chips (`350°F · 9 min`).

### 6.3 Tree (`/`)
- **`TreeCanvas`** — the pannable/zoomable viewport. Owns the pan/zoom transform (`translate + scale`, zoom around cursor), `Fit`, and drag-to-pan. Renders `EdgeLayer` (SVG) under absolutely-positioned `RecipeNode`s.
- **`useGraphLayout(graph)`** — runs `dagre` over `nodes`+`edges` (derive edges as the spanning DAG; composed sub-recipes placed as leaves/satellites) to produce `{x,y,w,h}`. Deterministic (no `Math.random`).
- **`RecipeNode`** — the card: role label, Fraunces name, `MacroLine`, `RatingChip`, optional feedback snippet; `cur` highlight for the focused node; `sub` styling (dashed) for sub-recipes. Click → `/r/[recipeId]`.
- **`EdgeLayer`** — SVG paths + markers: **inheritance** = solid toffee line, hollow **▷ triangle** at the base; **composition** = dashed muted line, hollow **◇ diamond** at the composing recipe. (UML inheritance/composition, not DB crow's-foot.)
- **`BakeoffPill`** — for head-to-head pairs; hover reveals the diff note (A vs B + each vs the base it forked), data from `RecipeSource.compare`.
- **`TreeOutline`** — the togglable left panel: a real navigable tree (expand/collapse families → base → variants, click-to-jump), rating glyph per leaf, active-node highlight. Toggle hides it and the canvas reflows.
- **`Legend`**, **`CanvasControls`** (Fit, Hide/Show tree).

### 6.4 Interaction model
- **Pan** (drag canvas), **zoom** (wheel, around cursor, clamped), **Fit** (recenter+rescale to viewport), **toggle outline**.
- **Click node** → bake card. **Hover bake-off** → diff note. **Outline click** → pan/focus that node.
- **(v1.1) Select subgraph → investigate:** clicking a base (or a "focus" control) highlights its subgraph — descendants via `derives` + its composed sub-recipes — and dims the rest; the outline filters to match. The `TreeGraphVM` adjacency already supports this; it's a view-state toggle, no new data.

---

## 7. Visual System (locked — mockups are the source of truth)

Tokens (CSS variables), proven in the `tree.html` / `red-velvet.html` mockups:

```
--page:#FBF7F0; --surface:#FFFDFA; --panel:#FFFFFF;
--ink:#241D13; --ink-soft:#463D2E; --muted:#8C8474; --faint:#B5AC9A;
--line:rgba(60,44,18,.10); --line2:rgba(60,44,18,.16);
--accent:#B47A37; --accent-deep:#956120; --accent-soft:#F6EBD9;
--green:#5E9A6B; --gold:#C79A3B; --warn:#9a5230;
--serif:Fraunces;  --mono:'JetBrains Mono';  --sans:Inter;
```
- **Fraunces** for recipe names/headings (the uniqueness lever), **JetBrains Mono** for data/labels/macros, **Inter** for chrome.
- Light warm "whiteboard" canvas (dot grid) for the Tree; clean document for the Bake Card.
- One toffee accent; green for made, amber ring for to-make; no emoji.

The two mockups (`tree.html`, `red-velvet.html`) are pixel references the components should match.

---

## 8. File Structure (`packages/web`)

```
packages/web/
  package.json                # next, react, react-dom, dagre; @batch/core workspace dep
  next.config.mjs             # transpilePackages: ['@batch/core']
  scripts/bake-data.mjs       # db.json -> data/db.json (pre-build)
  data/db.json                # baked (gitignored locally; produced in CI)
  app/
    layout.tsx                # fonts, tokens, TopBar
    page.tsx                  # Tree
    r/[recipeId]/page.tsx     # Bake Card (generateStaticParams over all recipes)
    index/page.tsx            # Recipes list
  components/
    tree/ TreeCanvas, RecipeNode, EdgeLayer, BakeoffPill, TreeOutline, Legend, CanvasControls
    card/ RecipeHero, IngredientList, CompositionRollup, Lineage, TastingLog, Method
    shared/ TopBar, MacroLine, RatingChip, StateDot
  lib/
    source/ RecipeSource.ts, StaticRecipeSource.ts
    viewmodel/ bakeCard.ts, treeGraph.ts, compare.ts   # @batch/core -> VM adapters
    layout/ useGraphLayout.ts                            # dagre wrapper
  styles/ tokens.css, *.module.css
```

---

## 9. Testing

- **View-model adapters** (`lib/viewmodel/*`): unit-tested for **parity** — assert the VM macros equal `@batch/core` / CLI output for representative recipes (Turtle, Red Velvet A/B, a sub-recipe). This is the trust anchor.
- **Layout**: `useGraphLayout` is deterministic — same graph → same positions (snapshot test; no `Math.random`/`Date`).
- **Components**: render smoke tests (card renders all groups; node renders rating + feedback; outline expands).
- Pan/zoom is left to manual QA in v1 (or Playwright later).

---

## 10. Open Decisions (recommendations — confirm in review)

1. **Graph rendering:** custom SVG/DOM + `dagre` layout (recommended) vs React Flow. → **custom + dagre** for design control.
2. **Hosting:** Vercel (recommended) vs static export to CF/GH Pages. → **Vercel** for speed; revisit if you want zero-vendor.
3. **Data-in-CI:** private-repo deploy key (recommended, always-fresh) vs committed `db.json` snapshot (simplest). → **deploy key**, snapshot as fallback.
4. **URL identity:** `recipeId` (recommended, stable) vs name slug. → **recipeId**.

---

## 11. Definition of Done (v1)

- `pnpm --filter @batch/web build` produces a static site from the real `db.json`.
- Every recipe has a reachable, correct Bake Card (macros == CLI, dual-unit ingredients, flattened sub-recipes, tasting log).
- The Tree renders all families, pan/zoom/Fit/outline-toggle work, edges show inheritance/composition, nodes show macros + ratings + feedback, the red-velvet bake-off shows its hover diff.
- Deployed at a public URL; a data-repo push redeploys it.
- `RecipeSource` write methods exist as declared-but-unimplemented, with a short README note on how writes drop in — proving the no-rewrite path.
