# Deploying the Batch web viewer (Vercel)

The viewer is a static Next.js app (`packages/web`). It reads recipe data from the **private**
`batch-data` repo *at build time* and renders a fully static site. **No part of your store is
committed to this (public) `batch` repo** — the Vercel build clones the private data with a
read-only token you control, bakes it, and `next build`s. Only the rendered site is public.

```
Vercel build (Root Directory = packages/web):
  pnpm install
  git clone batch-data (private, via $BATCH_DATA_TOKEN)  ->  /tmp/batch-data
  BATCH_DB=/tmp/batch-data/db.json pnpm build            ->  bake + next build
  serve packages/web/.next  (static)
```

## One-time setup

### 1. Create a read-only token for the private data repo

GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*:

- **Resource owner:** `WilliamJin123`
- **Repository access:** *Only select repositories* → **`batch-data`**
- **Permissions:** *Repository permissions* → **Contents: Read-only** (nothing else)
- **Expiration:** your call — set a calendar reminder to rotate it

Copy the token (`github_pat_…`). This is the only secret; it lives only in Vercel.

### 2. Import the repo into Vercel

[vercel.com](https://vercel.com) → **Add New… → Project** → import `WilliamJin123/batch`:

- **Root Directory:** `packages/web`  ← important; the app lives there and Vercel will
  auto-detect Next.js + install the pnpm workspace from the repo root.
- **Framework Preset:** Next.js (auto-detected; `vercel.json` also pins it).
- **Environment Variables:** add
  - `BATCH_DATA_TOKEN` = the token from step 1 — enable for **Production** and **Preview**.
- **Deploy.**

`packages/web/vercel.json` already encodes the build (clone → bake → `next build`); you do not
set a build command in the UI.

## Publishing changes

- **Code** (this repo → `main`): Vercel **auto-deploys** on push.
- **Recipes** (the `batch-data` repo): do **not** auto-publish — your in-progress experiments
  (to-make bake-offs, anything still tuning) stay private until you choose to show them. To
  publish the current store, trigger a fresh deploy (it re-clones the latest data):
  - Vercel dashboard → project → **Deployments → ⋯ → Redeploy**, or
  - create a **Deploy Hook** (Project → Settings → Git → Deploy Hooks), keep its URL private,
    and `curl` it when ready:
    ```bash
    curl -X POST "$BATCH_DEPLOY_HOOK_URL"
    ```

Want every push to `batch-data` to auto-publish instead? Add a one-line GitHub Action in
`batch-data` that `curl`s the deploy hook on push to `master`. **No change to this repo.**

## CLI alternative (optional)

```bash
npm i -g vercel
vercel login
cd packages/web && vercel link      # link to the Vercel project
vercel env add BATCH_DATA_TOKEN     # paste the read-only token
vercel --prod                       # deploy
```

## Why this stays clean

- The ~1.6 MB store is **never** committed to the public repo — only the rendered static site
  is public (the curated surface you want public).
- `vercel.json` references `$BATCH_DATA_TOKEN` (an env var), never the secret itself.
- If the token is missing/invalid the build **fails loudly** (no silent stale-data deploy).
- All macro / domain logic stays in `@batch/core`; the site is a pure build-time render, so it
  matches the CLI to the cent.
