# M2 — Macros & Units (implementation record)

**Goal:** compute nutrition for any recipe version from its ingredients + quantities, and freeze it onto the version — so the tune-toward-a-macro-goal loop runs on real numbers, not guesses.

**Status:** shipped on branch `batch-core`, 2026-06-14. Executes the already-approved design in [`../specs/2026-06-14-batch-core-design.md`](../specs/2026-06-14-batch-core-design.md) — §6 `library_ingredient`, §7 `compute_macros`, decisions **D8** (gram-canonical units) and **D9** (mutable library, snapshot-protected), use-cases **UC16–UC19, UC27**.

**Architecture:** a pure `computeMacros(content, yield, ingredients)` in `core` sums per-usage contributions; `RecipeService` loads the referenced library ingredients and snapshots the result onto every version it writes. Unit conversion is gram-canonical (D8). Storage adds an `ingredients` table to the same `Repository` seam (in-memory + single-JSON-file adapters).

---

## Key decisions

Inherited from the core spec:
- **D8 — gram-canonical.** Every ingredient's macros are per 100 g. A usage's quantity is converted to grams before scaling. Mass↔mass and volume↔volume use a static universal table; **volume↔mass routes through the ingredient** (density), never the universal table — a cup of flour ≠ a cup of water.
- **D9 — mutable library, immutability via the snapshot.** `LibraryIngredient` is a plain mutable record. Editing it never rewrites a past version's numbers; each version froze its own `macros` at commit. Corrections fold in via **recompute** (a new version, author=`system`).
- **UC18 — never throws.** Unknown ingredient / unconvertible unit / sub-recipe slot → that usage is listed in `unresolved[]`, `basis` becomes `"partial"`, the rest still sum.

Implementation-level calls made here (beyond the spec letter):
- **D-M1 — density scalar *and* per-unit equivalences.** The spec models the volume↔mass bridge as per-unit `unit_equivalences` (`1 tbsp butter = 14 g`). We support that (`unitEquivalences`, also the only way to do count units like `1 each = 50 g`) **plus** a single `densityGPerMl` that converts *every* volume unit at once — far less to author for liquids. `unitEquivalences` wins when both apply.
- **D-M2 — `recompute` command.** The real workflow is "enter recipes now, populate the library after." `recomputeMacros` re-snapshots against the current library as a new version; **idempotent** (returns the same version when nothing changed) to avoid version churn.
- **D-M3 — partial macros surfaced everywhere.** `macros.basis` + `unresolved[]` on the snapshot; `kcalPerServing` + `macroBasis` on `list` rows, so the gaps are visible while browsing.

Deferred (hooks left, per spec §9): sub-recipe macro recursion (M3 — currently a `sub_recipe` slot is `unresolved`); USDA auto-resolution (UC17 ladder); cooked-vs-raw transforms (`prepState` stays display-only).

---

## File map

**core**
- `src/types.ts` — `Macros`, `LibraryIngredient`, `MacroLine`, `MacroSnapshot`; `RecipeVersion.macros?`.
- `src/units.ts` — `toGrams(value, unit, ingredient)`: universal mass/volume tables + the density/equivalence bridge. Pure, never throws.
- `src/compute-macros.ts` — `computeMacros(content, yield, ingredients)`: sum per usage → `MacroSnapshot` (`total`, `perServing`, `basis`, `unresolved`, `lines`).
- `src/repository.ts` + `src/in-memory-repository.ts` — `saveIngredient` / `getIngredient` / `listIngredients`.
- `src/recipe-service.ts` — `macrosFor()` helper; snapshots on create/derive/override/edit; `addIngredient`/`getIngredient`/`listIngredients`; `recomputeMacros`.
- `src/index.ts` — export `computeMacros`, `toGrams`, `normalizeUnit`.

**cli**
- `src/file-repository.ts` — `ingredients` table; back-compat load (pre-M2 stores with no `ingredients` key still open).
- `src/commands.ts` — `ingredientAdd` (slug id) / `ingredientList` / `macros` / `recompute`; `list` rows carry `kcalPerServing` + `macroBasis`.
- `src/cli.ts` — `ingredient add|list`, `macros <id>`, `recompute <id>`.

**skill** — `.claude/skills/batch/SKILL.md` — Macros & ingredient-library section, new commands, the seed-then-recompute loop.

---

## Test coverage (46 total: core 32, cli 14)

- `units.test.ts` (7) — mass table, case/whitespace, volume×density, missing-density reason, `unitEquivalences` precedence, unknown unit.
- `compute-macros.test.ts` (4) — complete sum + per-serving, partial (sums the rest), sub-recipe unresolved, non-positive yield guard.
- `recipe-service.test.ts` (+3) — ingredient round-trip; partial-on-create → complete-after-add+recompute; recompute idempotence.
- `file-repository.test.ts` (+2) — ingredient persistence across instances; legacy store without `ingredients` key.
- `commands.test.ts` (+2) — `ingredientAdd` slugify/list; macros partial→complete via CLI layer.
- End-to-end CLI smoke (scratch store): all three conversion paths (200 g sugar / 0.5 cup butter via density / 2 eggs via equivalence) → 1689.68 kcal total, 105.61/serving; derive+override auto-recomputes 1689.68 → 1225.28 kcal.
