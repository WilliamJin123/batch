# @batch/web

A read-only, statically-generated Next.js viewer over the Batch recipe store. It renders the
same macros the CLI computes (via `@batch/core`) as a pannable/zoomable recipe **Tree** (`/`),
a full **Bake Card** per recipe (`/r/[recipeId]`), and a filterable **index** (`/index`).

## Data source

The build bakes a snapshot of the store into `data/db.json` (gitignored) via `scripts/bake-data.mjs`:

- Default source: `~/.batch/db.json`.
- Override with `BATCH_DB=/path/to/db.json`.

`pnpm --filter @batch/web build` runs the bake, then `next build`. There is **no** runtime data
access — every page is generated at build time.

## Local development

```bash
node packages/web/scripts/bake-data.mjs   # bake the current store into data/db.json
pnpm --filter @batch/web dev               # http://localhost:3000
```

## Architecture: reads now, writes drop in with NO rewrite

Pages depend only on **view-models** (`BakeCardVM`, `TreeGraphVM`, `RecipeSummary`) produced
behind the **`RecipeSource`** seam (`lib/source/RecipeSource.ts`). v1 ships `StaticRecipeSource`
(reads only). The seam already declares the write methods (`applyOverride`, `addFeedback`, …)
as optional-unimplemented.

To add writes later you do **not** touch any page or component: implement those seam methods
against the *same* `@batch/core` mutations the CLI uses (`derive` / `applyOverride` /
`editMetadata` / `addFeedback` / `promote` / `rebase`) behind a Next route handler, and swap the
injected source. All mutation logic stays in `@batch/core`, so the CLI, the web app, and any
future agent share one operation set.

## Deploy (Vercel)

`vercel.json` builds with the monorepo filter and emits `packages/web/.next`. A push to the
data repo can trigger a Vercel deploy hook (with a read-only deploy key that bakes `db.json`),
making the published site track the store — "live" without a runtime backend.
