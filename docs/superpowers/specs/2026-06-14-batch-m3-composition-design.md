# Batch M3 — Composition / Sub-Recipes — Design Spec

> **The composition layer of Batch `core`.** Finishes the sub-recipe hook the macro engine
> already stubs, so a slot can resolve to *another recipe version* and its macros recurse,
> a composed recipe reads as one flattened card, and a shared sub-recipe (a frosting) can be
> swapped and tracked for staleness.
> Status: **design approved, pre-implementation.** Date: 2026-06-14.

This refines the composition use-cases already enumerated in the [core design spec](./2026-06-14-batch-core-design.md)
— **UC13, UC14, UC15, UC18, UC12** and §7 `compute_macros` — into the specific, buildable M3 layer.
It is written to be read two ways: as a **review artifact** (checkable before code) and as an
**explainer** (the reasoning, not just the result). Every decision leads with *why*.

---

## 1. What M3 delivers

The substrate already models composition structurally: `SlotResolution` has a
`{ kind: "sub_recipe"; subRecipeVersionId }` arm (`types.ts:24`), a sub_recipe pin survives in
stored `content`, and `compute-macros.ts:49` deliberately punts on it
(`fail("sub-recipe macros not computed yet (M3)")`). M3 fills that single seam and the reading
surface around it:

1. **Macro recursion (UC18).** A sub_recipe slot contributes a fraction of the pinned child
   version's macros to its parent. The engine stays pure and never throws.
2. **Flattening (UC4, reading-side).** A composed recipe expands — on read, never stored — into
   one coherent card: the child's steps and ingredients spliced in, scaled by the same fraction.
3. **Swap (UC14).** Changing which sub-recipe a slot resolves to is a single component-level
   override — the slot *is* the swap point (D6).
4. **Cycle safety (UC15).** Authoring a sub_recipe resolution is guarded against forming a cycle.
5. **Staleness count (UC12, read-only).** A sub_recipe pin can fall "N versions behind" the
   child's head; M3 surfaces the count. *Adopting* a newer child (rebase/re-point) is **M4**.

**Driving case:** a protein **frosting** shared across Crumbl cookies that itself varies
(cream-cheese vs Cool-Whip). Today each cookie inlines ~5 duplicated frosting usages. After M3 the
frosting is one root recipe with variants, *composed into* each cookie.

---

## 2. Key decisions (with rationale & alternatives)

### DM3-1 — Recursion reads the **frozen child snapshot**, not a live recompute
*Options:* (1) parent reads the pinned child version's already-frozen `macros.total`;
(2) parent re-runs `computeMacros` on the child's content live against the current library;
(3) flatten-on-compose (copy the child's usages into the parent at author time, no live link).
*Choice:* **(1).** *Why:* a sub_recipe slot pins an **immutable** version, and every version already
froze its own `MacroSnapshot` at commit (D3/D9). Reading it makes a sub_recipe pin behave *exactly*
like a `derives_from` pin — same immutability, same "N behind" staleness, same "recompute the child →
new version → parents adopt it via rebase" correction path. It is O(1) per child (the deep rollup is
memoized across the immutable DAG), where (2) is O(tree) and couples a parent's number to mutable
state outside its pinned graph, and (3) throws away the shared link, staleness, and the entire point
of composition.

### DM3-2 — A sub-recipe is measured as a **fraction of its own yield**, via one ladder
*Options:* mass-only (always grams), yield-fraction-only (always "1 batch"), or a unified rule.
*Choice:* **a unified 3-rung ladder** that resolves any usage to a fraction of the child's batch:

```
subRecipeFraction(usage, child):           // child = { yield, totalGrams }
  u = normalizeUnit(usage.quantityUnit); y = normalizeUnit(child.yield.unit)
  1a. u === y                       → fraction = usage.value / child.yield.amount
  1b. convertWithin(value,u,y)≠∅    → fraction = converted / child.yield.amount   (same dimension via the universal table)
  2.  mass unit u, child.totalGrams → fraction = massToGrams(value,u) / child.totalGrams
  3.  otherwise                     → unresolved("measure in <yield.unit> or grams")
```

*Why one rule covers all three of the author's situations:*
- **Batch-fraction (default):** frosting `yield 1 batch`, cookie uses `1 batch` → 1.0 (rung 1a).
- **Literal count:** ladyfingers `yield 24 ladyfingers`, tiramisu uses `18 ladyfingers` → 18/24 (rung 1a).
- **Grams, always available:** glaze `yield 150 g`, drizzle `20 g` → 20/150 (rung 1b); and even a
  *batch*-yielded frosting accepts `20 g` via rung 2 (`20 / batch-weight`).

Contribution = `fraction × child.total`; the per-line grams shown = `fraction × child.totalGrams`.
Because `scale` (UC5) multiplies `usage.quantityValue`, doubling a cookie batch turns `1 batch` of
frosting into `2 batches` for free.

### DM3-3 — Flattening is a **derived read** (never stored); the two views provably agree
*Choice:* `flatten(version)` expands sub_recipe slots into the child's steps + ingredients (scaled by
the fraction, sectioned under the child's name), recursing through the subtree. It is computed on
read — like `scale` — and **never persisted**; the stored truth stays "parent + a sub_recipe pin,"
which is what keeps the link swappable and DRY. *Why default-on:* the author makes **self-contained
recipes**, not an inventory of batched sub-components, so the flat card is the natural way to read or
cook one. *The invariant that makes this safe:* the **fraction ladder is one shared function**, used by
both the macro engine and the flattener, so `fraction × child.total` (rollup) equals
`Σ(scaled spliced ingredients)` (flatten) by construction — the macro total is **invariant to
flattening** (modulo ≤0.01, since the child's frozen `total` is pre-rounded). A structural view
(`--structure`) keeps the un-flattened pins visible for managing/swapping.

### DM3-4 — Swap = a **single `replace slot` override**; no new command
*Choice:* changing a frosting is `replace slot <frostingKey>` with a new `sub_recipe` resolution; the
macro engine re-rolls automatically. A/B testing two frostings on one cookie = two cookie variants,
each overriding the frosting slot (the variant tree, UC7/UC8, doing its job). **No `compose` command**
is added — a sub_recipe slot is authored through the existing `create --file` / `override` surface.
*Why:* a slot is "the requirement + the swap point" (D6); raw-vs-sub_recipe is *just the resolution*,
so a sub-recipe swap is exactly as clean as a raw-ingredient swap. **Guideline:** keep a family of
interchangeable sub-recipes on the **same yield unit** (all frostings `yield 1 batch`) so the `1 batch`
usage still resolves after a swap and the override stays a one-liner; a cross-unit swap is
`replace slot` *plus* `replace usage` — still clean overrides, no new mechanism.

### DM3-5 — Cycle safety is an **authoring-time guard** (UC15)
*Choice:* when a slot's resolution is set/replaced to `sub_recipe`, walk the target version's transitive
sub_recipe closure; reject if it reaches the recipe being edited. *Why:* the spec mandates UC15.
Structurally a cycle is near-impossible — pins reference *already-committed* versions and edges point
backward in time, so the version DAG is acyclic by construction — but the guard is cheap insurance and
is unit-testable as a pure function against a hand-built cyclic map.

### DM3-6 — Staleness is a **read-only count** in M3; the *action* is M4
*Choice:* `staleness(pinVersionId)` counts the versions the pinned child's head is ahead of the pin
(0 = current). It is surfaced inline on the composed-recipe display (`— from Cream Cheese Frosting v2
· 1 behind`). *Why the cut here:* the count is a trivial walk and makes drift visible; the *resolution*
of drift — re-pointing a pin / rebasing onto a newer child — shares all its machinery with variant
rebase (UC11) and belongs with extract-base in **M4**. §7 already says staleness applies to *both*
pinning edges, so this is the composition half of one shared notion.

---

## 3. Mechanics & data flow

**The carrier (core → engine).** The service hands the engine a read-only view of each pinned child,
built from that child version's frozen snapshot:

```ts
interface SubRecipeMacro { total: Macros; yield: Yield; totalGrams: number; basis: "complete" | "partial"; }
```
`totalGrams` = Σ of the child snapshot's resolved `lines[].grams` (used by rung 2 and for line display).

**Engine (`compute-macros.ts`).** `computeMacros(content, yield, ingredients, subRecipes?)` gains an
**optional** 4th arg (every M2 call site is unaffected). The `fail("…M3")` branch becomes: look up the
pinned child in `subRecipes` (absent → unresolved); compute `fraction` via the shared ladder; add
`fraction × child.total`; push an `ok` line with `grams = fraction × child.totalGrams`. **Partiality
propagates:** if `child.basis === "partial"`, the parent records one `unresolved` note (so its `basis`
goes partial) without spamming the child's internal gaps.

**Service (`recipe-service.ts`).** `macrosFor()` additionally collects `sub_recipe` pins from
`content.slots`, loads those versions, and builds the `subRecipes` map **from each child's frozen
`.macros`** — a read, not a recursive recompute (DM3-1). Two new methods: `flatten(versionId)` (gather
the transitive closure of pinned child *contents*, call the pure flattener) and `staleness(pinVersionId)`.
A `assertAcyclic(thisRecipeId, targetVersionId)` check runs in `createRecipe` / `applyOverride` whenever a
slot resolves to `sub_recipe`.

**Units (`units.ts`).** Two pure additions beside `toGrams`: `convertWithin(value, from, to)` — same
dimension only (mass↔mass via `MASS_TO_GRAM`, volume↔volume via `VOLUME_TO_ML`), `undefined` across
dimensions — and `massToGrams(value, unit)` — `undefined` when `unit` is not a mass unit. Both feed the
ladder; neither touches density (volume↔mass stays an ingredient concern, D8).

**Shared ladder (`sub-recipe.ts`, new).** `subRecipeFraction(usage, child)` is the single source of
truth used by *both* the engine and the flattener — this is what guarantees the DM3-3 invariant.

**Flattener (`flatten.ts`, new — pure).** `flattenContent(content, subContents, scale)` — where
`subContents` is a `Map<VersionId, { content, yield, totalGrams, name }>` of the pinned subtree — copies
steps (component keys prefixed to avoid collisions), passes raw usages through scaled by `scale`, and for
each sub_recipe usage splices the child's recursively-flattened content scaled by `scale × fraction`,
under a section named for the child. Returns a `RecipeContent`; provenance + staleness are overlaid by
the service (`flatten` returns `{ content, sources: Array<{ section, recipeName, versionId, behind }> }`).

**Display (`commands.ts` / `cli.ts`).** `show` / `resolve` **flatten by default**; `--structure`
returns the stored composed content with each sub_recipe slot annotated by its staleness. `macros`
needs no surface change — its `lines[]` now include the rolled-up sub-recipe contributions
automatically.

---

## 4. File map

**core**
- `src/units.ts` — add `convertWithin`, `massToGrams` (pure; same-dimension + mass-only helpers).
- `src/sub-recipe.ts` *(new)* — `SubRecipeMacro` is in `types.ts`; this exports `subRecipeFraction(usage, child)` (the shared ladder).
- `src/compute-macros.ts` — 4th param `subRecipes`; implement the sub_recipe branch via `subRecipeFraction`; propagate partial basis.
- `src/flatten.ts` *(new)* — pure `flattenContent(content, subContents, scale)`.
- `src/types.ts` — add `SubRecipeMacro`.
- `src/recipe-service.ts` — `macrosFor` gathers child snapshots; new `flatten`, `staleness`, `assertAcyclic`; call the guard on create/override.
- `src/index.ts` — export `subRecipeFraction`, `flattenContent`, `convertWithin`.

**cli**
- `src/commands.ts` — `show`/`resolve` expand by default (+ `structure` option); new `stale` read is optional.
- `src/cli.ts` — `--structure` flag on `show`/`resolve`; wire staleness annotation.
- `src/file-repository.ts` — **no change** (sub_recipe pins are version refs already inside stored `content`).

**skill**
- `.claude/skills/batch/SKILL.md` — composition section: sub_recipe slots, the measurement ladder, flatten vs structure, swap-via-override, staleness, and the compose-and-verify loop.

---

## 5. Dogfood plan (the "see how it affects our recipes" demo)

Run against a **scratch store first** (`BATCH_DB=/tmp/...`), then the real `~/.batch`:

1. **Extract the frosting** — create `Protein Cream Cheese Frosting` as a **root** recipe from Red
   Velvet's inline frosting usages, `yield { amount: 1, unit: "batch" }`.
2. **Convert Red Velvet** — via overrides: `remove` the 5 inline frosting slots + their usages, `add`
   one `sub_recipe` slot (resolving to the frosting version) + one usage (`1 batch`) on the frosting step.
3. **Assert preservation** — the converted Red Velvet's macro total matches the original inline
   version **to within rounding (≤0.01/serving)**, and `flatten(converted RV)` reads back as the
   original single recipe. This is composition's content-and-macro analog of D10's invariant.
4. **Branch the frosting** — `derive` a **Cool-Whip** frosting variant (`yield 1 batch`, so the swap is
   one `replace slot`); show a cookie composing it.
5. **Show staleness** — `override` the frosting (a new child version); confirm the cookie reads
   `frosting · 1 behind` (adopting it is M4).

---

## 6. Testing strategy

**core (pure)**
- `units.test.ts` — `convertWithin`: mass↔mass, volume↔volume, `undefined` across dimensions; `massToGrams`: grams for mass units, `undefined` otherwise.
- `sub-recipe.test.ts` — the ladder: rung 1a (batch & count), rung 1b (grams vs gram-yield), rung 2 (grams vs batch-yield), rung 3 (unresolved with hint).
- `compute-macros.test.ts` — sub_recipe rollup (`fraction × total`); fractional usage (0.5 batch); **partial child → parent partial**; missing child in map → unresolved.
- `flatten.test.ts` — child steps/ingredients spliced & sectioned; quantities scaled by the fraction; nested (sub-of-sub) recursion; key-prefix collision avoidance.
- **Invariance test** — for a composed recipe, `computeMacros(total)` == `computeMacros(flatten(...))` within ≤0.01 (DM3-3).
- cycle guard — pure `assertAcyclic` rejects a hand-built cyclic map.

**service / cli**
- `recipe-service.test.ts` — compose end-to-end: macros roll up; `staleness` returns 0 then N after the child advances; `assertAcyclic` fires on create/override.
- `commands.test.ts` — `show` flattens by default; `--structure` shows pins + staleness.
- **CLI smoke (scratch store)** — the dogfood §5 steps 1–3: convert Red Velvet and assert the
  pre/post macro totals match to the cent.

---

## 7. Out of scope (→ M4 and later)

- **Extract-base (UC10/D10)** and **rebase / re-point a pin (UC11)** — the *action* half of staleness;
  shares 3-way-merge machinery. **M4.**
- **Field-level overrides (D5)**, **bake-time interpolation (D13)**, **cooked-vs-raw transforms** — unchanged from the core spec's deferral.
- A dedicated `compose` command (DM3-4) and a persisted flattened snapshot (DM3-3) — intentionally not built.
