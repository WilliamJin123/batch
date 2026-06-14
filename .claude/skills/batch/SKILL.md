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
- **slots** (an ingredient "slot" — the swap point): `{ componentKey, name, prepDefault?, resolution: { kind: "raw", libraryIngredientId } }` — for now always `kind: "raw"`. `libraryIngredientId` is a slug like `ing-sugar`; add a matching **library ingredient** (see Macros below) so its nutrition computes, and reuse the same id across recipes so one ingredient serves them all.
- **usages** (a quantity of a slot used in a step): `{ componentKey, stepKey, slotKey, quantityValue, quantityUnit, prepState? }`

`yield` is `{ amount, unit }` (e.g. `{ amount: 16, unit: "squares" }`).

## Commands

- `./batch create` — reads recipe JSON `{ name, yield, content, description?, tags? }` from **stdin**. Prints `{ recipe, version }`.
- `./batch derive <baseVersionId> --name "<name>"` — fork a variant. Prints `{ recipe, version }`.
- `./batch override <versionId> -m "<msg>"` — reads ONE override entry from **stdin**; applies it to a **base OR a variant**, creating a new immutable version. On a base the change is baked straight into its content (this is how you tune a base in place — cut its sugar, drop its bake temp). On a variant it's recorded as a component-level delta over the base, inheriting everything else. Entry shapes:
  - replace: `{ "op": "replace", "kind": "usage", "target": "u_sugar", "payload": { ...full StepUsage... } }` (kind ∈ step|slot|usage)
  - add: `{ "op": "add", "kind": "slot", "payload": { ...full IngredientSlot... } }`
  - remove: `{ "op": "remove", "kind": "step", "target": "s2" }`
  (`edit` is for metadata only — name/description/status/tags/yield; `override` is for content.)
- `./batch edit <versionId> [--name --description --status --tags a,b --yield-amount N --yield-unit U -m msg]` — new version with changed metadata; content unchanged. `--status` ∈ draft|approved|rejected.
- `./batch show <versionId>` — the version + resolved content.
- `./batch resolve <versionId>` — just the resolved content.
- `./batch scale <versionId> --to <amount>` — content with quantities scaled to a target yield amount (units preserved; step times intentionally NOT scaled).
- `./batch history <versionId>` — versions newest-first along the history edge.
- `./batch list` — all recipes by head version (`name, status, tags, isVariant`, plus `kcalPerServing` / `macroBasis`).
- `./batch tree` — all versions with `derivesFromVersionId` / `prevVersionId` edges (build the forest of bases → variants).
- `./batch ingredient add` — reads a **library ingredient** JSON from stdin (`{ name, macrosPer100g, densityGPerMl?, unitEquivalences?, id? }`); `id` defaults to a slug of the name. Adds/updates the (mutable) library.
- `./batch ingredient list` — list the library.
- `./batch macros <versionId>` — the computed macro snapshot: `total`, `perServing`, `basis` (`complete`|`partial`), `unresolved[]`, and per-usage `lines`.
- `./batch recompute <versionId>` — recompute macros against the **current** library → new version (author=system). Run after adding/fixing ingredients so an existing recipe picks up the numbers. Idempotent when nothing changed.
- `./batch init` — print the store path (`$BATCH_DB`, else `~/.batch/db.json`).

## Macros & the ingredient library

Every version carries a **frozen macro snapshot** (`version.macros`), recomputed automatically on create / derive / override / edit. Macros are **gram-canonical**: each library ingredient defines `macrosPer100g` (`{ calories, protein, carbs, fat, fiber }`), and every usage's quantity is converted to grams before summing.

- **Unit conversion** (per usage): mass units (`g/kg/oz/lb…`) convert directly; **volume** units (`cup/tbsp/tsp/ml…`) need the ingredient's `densityGPerMl`; **count/scoop** units (`each`, or a packed `cup`) need an explicit `unitEquivalences` entry — `{"each": 50}` means "1 each = 50 g". `unitEquivalences` wins over the universal tables.
- **Partial is fine.** An unknown ingredient or an unconvertible unit never throws — that usage is listed in `unresolved[]`, `basis` becomes `"partial"`, and the rest still sum. So enter recipes now and fill in the library later.
- **Authoring an ingredient:** macros come from a nutrition label (per 100 g) or USDA. Set `densityGPerMl` for liquids (water ≈ 1, oil ≈ 0.92, milk ≈ 1.03); set `unitEquivalences` for things measured by count/scoop (`{"each": 50}` for an egg, `{"scoop": 30}` for protein powder).

## Typical workflow (the user's real loop)

1. The user shares an Instagram reel caption, a blog URL, or a screenshot of a recipe.
2. **You** parse it into the `create` JSON: split the method into `steps`, each ingredient into a `slot`, each "Xg of Y in step Z" into a `usage`. Choose clean `componentKey`s. If ingredients aren't tied to specific steps, attach them all to the first/relevant step.
3. Run `./batch create` (pipe the JSON via stdin). Report the new `version.id`.
4. **Seed macros:** for each ingredient the recipe references, `./batch ingredient add` it (macros per 100 g; `densityGPerMl` for liquids, `unitEquivalences` for count units), reusing library ids across recipes; then `./batch recompute <versionId>`. Macros stay `partial` until every referenced ingredient exists — that's expected, not an error.
5. Tune conversationally: cut sugar, swap an ingredient, change bake temp → `./batch override <versionId>` (works on the base itself or any variant). Each tweak is a new immutable version with its macros recomputed, so history *and* nutrition are preserved.
6. To spin a new flavor off a dialed-in base: `./batch derive <baseVersionId> --name "Biscoff Cheesecake"`, then `override` the differences.
7. Browse with `./batch list` / `./batch tree`; see nutrition with `./batch macros <versionId>`; scale a batch with `./batch scale`.

## Running commands

Pipe stdin for `create`/`override`. Example:
```bash
echo '<recipe-json>' | ./batch create
```
Prefer a heredoc or a temp `--file` for large JSON. Always run from `/Users/williamjin/Documents/batch`. To target a scratch store, prefix `BATCH_DB=/path/to/db.json`.
