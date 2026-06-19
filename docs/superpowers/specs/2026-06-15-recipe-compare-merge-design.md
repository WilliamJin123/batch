# Batch — Recipe Compare & Merge (M4) — Design Spec

> **The quality-driven tuning layer over Batch `core`.** Lets you put several recipes side by side,
> bake the *best-tasting* choices into a **champion base** (not the lowest-common-denominator
> intersection), and push that base's improvements down to its variants — with judgment kept in the
> agent conversation, not hidden in a merge heuristic.
> Status: **design approved, pre-implementation.** Date: 2026-06-15.

This is **M4** — the action half of M3's read-only staleness. It is motivated by the real tuning
loop: *"given 3 protein Crumbl cookie recipes, only 1 uses cornstarch, but if it tastes best the base
should use cornstarch and the others should change."* The substrate can fork and tune today, but it
has **nowhere to see recipes against each other** and **no way to move a variant onto an improved
base**. Written to be read two ways: a **review artifact** (checkable before code) and an **explainer**
(the reasoning, not just the result). Every decision leads with *why*.

---

## 1. What this delivers

Four units sharing two pieces of machinery — a **compare alignment** and a **3-way merge**:

1. **`compare` — the cockpit (read-only).** Align ≥2 versions (any mix of roots, variants, families)
   into one view-model: an **ingredient matrix** joined by library-ingredient-id, **per-serving
   macros**, and **feedback verdicts**, side by side. This is what the agent reads to reason about
   *what each ingredient does and which differences are positive*. ("Only A has cornstarch; A is
   `excellent`.")
2. **`promote` — bake a winning choice into a base.** Lift named component(s) from a source version
   into a target, baking them in (override-on-root). Thin, semantic sugar over the existing engine.
3. **`rebase` — propagate a base change to its variants (the 3-way merge).** Re-point a variant onto
   an improved version of *its own* base; clean changes flow in for free, collisions resolve
   **variant-wins** and surface in a `conflicts[]` report. A batch `--all-variants` mode is the
   "easily propagate an objectively-good base change" path.
4. **Multi-parent provenance — the synthesized champion.** `create` gains optional `parents[]` +
   `rationale`, recording that a new root was amalgamated from several sources. The recipe forest
   becomes a DAG where a champion traces back to its inputs.

**The boundary call (CM-6):** the clean 3-way merge is **same-lineage only** (a variant and an
improved version of its own base — keys align, the merge is mechanical and sound). Converging
*unrelated roots* into one family is **not** a mechanical merge — it is an agent loop over `compare`
+ `derive` + `override`, because aligning recipes that share no key space (is A's "step 3" B's "step
3"?) is judgment, not mechanism. Forcing it would produce a junk override that shares no structure.

**Explicitly additive.** No repository-method changes; one optional pair of fields on `RecipeVersion`;
old stores load unchanged. `compare` writes nothing. `rebase`/`promote` reuse `materialize`, the macro
recompute, and `assertAcyclic` — they introduce no new mutation primitive, only new *compositions* of
the existing ones.

---

## 2. Key decisions (with rationale & alternatives)

### CM-1 — `compare` joins on **library-ingredient-id**, over **flattened** content
*Options:* align by (a) `componentKey`; (b) slot `name` (fuzzy text); (c) `libraryIngredientId`.
*Choice:* **(c), on flattened content.** *Why:* component keys are chosen **independently per recipe**
(recipe A's `sugar` vs B's `s_sugar`), so they only align within a derivation family — useless for the
motivating case of 3 *separate* roots. The library ingredient id is the one identifier that is
**shared by construction** (the skill already tells you to reuse `ing-*` ids across recipes), so it is
what lines up "who uses cornstarch." Running each version through the existing `flatten()`
(`recipe-service.ts:276`) first makes composition **transparent**: a shared frosting's sugar rolls into
the same `ing-sugar` row as a recipe that adds sugar directly, so the matrix compares *what's actually
in the bake*, not how it was structured. (b) is brittle; (a) silently fails to align the exact case we
care about.

### CM-2 — Quantities normalize to **per-serving grams**; **absent ≠ unquantified**
*Choice:* every matrix cell is the ingredient's **grams per serving** in that version — the same
gram-canonical basis the macro engine already uses (`compute-macros.ts`), summed across all usages of
that ingredient and divided by `yield.amount`. *Why grams/serving:* it is the only basis comparable
across recipes with **different yields and different authored units** (cups vs scoops vs grams) — and
it is exactly the number that drives macros, so the matrix and the nutrition agree. *Why three cell
states, not two:* a cell is `number` (quantified grams), `"present"` (the ingredient is used but its
unit can't convert — no density/equivalence, mirroring the macro engine's `unresolved`), or `null`
(absent). Collapsing `"present"` into `null` would make an **unconvertible** cornstarch look
**missing** — silently inverting the very signal compare exists to surface. Never throws; partial data
degrades to `"present"`, consistent with the macro engine's "partial is fine."

### CM-3 — `compare` is a **read-only view-model** over an **arbitrary set** of ≥2 versions
*Choice:* `compare(versionIds: VersionId[])` returns a pure view-model; it writes nothing, moves no
head. Input is an **arbitrary list** (not "a base and its variants") because the driving case is 3
unrelated roots. The **ingredient matrix is the spine**; **macros** and **feedback verdicts** ride in
the same view so "A uses cornstarch / A is `excellent`" is one glance. *Why a view-model and not a
rendered table:* the consumer is the **agent** mid-conversation — it needs structured rows to reason
over (and to then issue `promote`/`derive`/`override`), and the CLI layer renders the human view. Same
split as every other Batch command.

### CM-4 — `promote` is **thin sugar over override-on-root**, and **carries dependent usages**
*Options:* a brand-new promotion primitive; reuse `override`; a guided lift-from-source convenience.
*Choice:* **(c) — a thin convenience over the existing `applyOverride`.** *Why not a new primitive:*
"bake cornstarch into the base" is *already* one `override` on a root (`recipe-service.ts:150` — a
root applies the override straight into its content). `promote` adds no mechanism; it adds the right
**verb and provenance**: it *reads* the named component(s) from a **source** version and applies them
as add/replace overrides onto a **target**, recording "promoted from `<source>`" in the commit
message. *Why it auto-includes usages:* promoting a *slot* alone would leave a dangling ingredient
(a cornstarch slot nobody uses), so promoting a slot **also lifts the usages that reference it**; if a
lifted usage points at a step the target lacks, that's a clear error, not a silent dangling edge. Kept
deliberately small — if `promote` ever wants to grow, it grows toward `override`, never away.

### CM-5 — `rebase` is a **same-lineage 3-way merge**: variant-wins + `conflicts[]`, always one version
*Choice:* `rebase(variantVersionId, ontoVersionId)` re-points a variant from its current base `B0`
onto a newer version `B1` *of the same base recipe*, producing **one new version**:
`materialize(B1.content, V.overrideSet)`, macros recomputed, `derivesFromVersionId = B1`. Base changes
the variant didn't touch **flow in for free** (the clean propagate). Collisions — components changed by
`B0→B1` *and* targeted by the variant — resolve **variant-wins** (materialize applies the override
last) and every one is returned in a structured `conflicts[]`. *Why always-succeed-and-report instead
of abort-on-conflict:* the store is **append-only and immutable** — there is no working tree to hold
conflict markers, and a half-merged "conflicted version" has no home. Producing a concrete version
plus a report fits the grain (every op makes a new version; nothing destructive), and a wrong
auto-resolution is one more immutable `override` away from fixed. *Why variant-wins not base-wins:* the
variant's override is a **deliberate choice** (an intentional fork); base-wins would stomp exactly the
forks the flag-and-decide workflow exists to protect. The report makes the stomp-or-keep decision
**visible** so the agent can reverse any it disagrees with.

### CM-6 — **No mechanical cross-root merge**; cross-root convergence is an agent loop over `compare`
*Choice:* `rebase` **requires same lineage** — `ontoVersionId` must be a version of the same recipe the
variant currently derives from; a cross-recipe `--onto` is a **hard error** that points at the
compare+derive loop. Converging *unrelated* roots into a champion's family is done by the **agent**:
read `compare`, `derive` from the champion, apply only the genuine differences as `override`s. *Why
refuse the magic:* unrelated recipes **share no key space**, and a mechanical diff cannot know that A's
step 3 *is* B's step 3 when worded differently. Auto-aligning would emit a degenerate override ("remove
all of A's steps, add all of B's") that shares **no structure** — so future base improvements would
*not* propagate, defeating the entire reason to make it a variant. Judgment-driven convergence yields a
**clean** variant that shares real structure. This keeps `rebase` mechanical and trustworthy and keeps
the judgment where you said it belongs — in the conversation. *(An opt-in, clearly-labeled
"best-effort, ingredients-only" cross-root mode is noted in §7 as a possible later add, never the
default.)*

### CM-7 — Multi-parent provenance is a **pure metadata edge**, distinct from `derivesFromVersionId`
*Choice:* `RecipeVersion` gains `parentVersionIds?: VersionId[]` and `provenanceNote?: string`. An
**amalgam is a new root** (full content, no `overrideSet`) that merely **records** the versions it was
blended from. *Why a separate edge, not reuse `derivesFromVersionId`:* `derivesFromVersionId` carries
**materialization semantics** — a variant's deltas resolve against it. An amalgam has no deltas to
resolve; its parents are **provenance, not a base**. Overloading the single-parent edge would imply the
amalgam materializes against three bases (it doesn't) and would break variant logic. Keeping them
separate means `tree` can show the DAG ("this champion came from A, B, C") with zero risk to the
override/rebase machinery. Both fields optional → old stores and old code paths are untouched (the
"normalize-missing-key" property the feedback feature relied on).

### CM-8 — Batch propagation (`--all-variants`) is a **loop over the same `rebase` primitive**
*Choice:* `rebase --all-variants <baseVersionId>` finds every recipe whose head derives from the base
recipe and rebases each onto the base's **head**, returning a per-variant `{ version, conflicts }`.
*Why a batch mode and not a separate engine:* it is literally CM-5 in a loop; sharing the primitive
means conflict semantics are identical whether you propagate one variant or all of them. This is the
"agent should be able to easily propagate an objectively-good base change to variants" path — one
command, with every conflict surfaced per variant for the agent to adjudicate.

---

## 3. Mechanics & data flow

**Types (`types.ts`).**
```ts
// Multi-parent provenance (CM-7) — additive, optional, no materialization semantics.
interface RecipeVersion {
  // ...existing fields...
  parentVersionIds?: VersionId[];  // amalgam sources (provenance only)
  provenanceNote?: string;         // rationale for the blend
}
```

**Compare view-model (`compare.ts`, exported from `core`).**
```ts
export interface CompareColumn {
  versionId: VersionId;
  recipeId: RecipeId;
  name: string;
  isVariant: boolean;
  perServing: Macros;                       // version.macros.perServing
  macroBasis: "complete" | "partial";
  verdict?: Rating;                          // dish verdict (feedback currentVerdicts)
  componentVerdicts: Record<ComponentKey, Rating>;  // per-component verdicts, this version's keys
}

export interface CompareIngredientRow {
  ingredientId: string;
  name: string;
  perServingGrams: Record<VersionId, number | "present" | null>;  // CM-2: grams | unconvertible | absent
}

export interface CompareStepList {
  versionId: VersionId;
  steps: { order: number; section?: string; text: string }[];     // per-version, NOT force-aligned (CM-6)
}

export interface CompareView {
  columns: CompareColumn[];
  ingredients: CompareIngredientRow[];       // sorted; rows with any null/"present" cell = the divergences
  steps: CompareStepList[];
}
```
`compare(versionIds)` (service): for each version → `flatten()` to a raw-only content, sum each
`libraryIngredientId`'s usage grams (via the existing gram conversion) ÷ `yield.amount` for the cell;
pull `version.macros.perServing` and `feedback` verdicts. **Pure assembly** in `compare.ts` so the
matrix logic is unit-testable over fixtures; the service only gathers the inputs.

**Rebase merge (`rebase.ts`, pure; called by the service).**
```ts
export interface RebaseConflict {
  componentKey: ComponentKey;
  kind: "step" | "slot" | "usage";
  type: "both-changed" | "base-removed";     // base-removed: variant overrides a component B1 dropped
  baseNew: Step | IngredientSlot | StepUsage | null;
  variantKept: Step | IngredientSlot | StepUsage;
}
export interface RebaseResult { version: RecipeVersion; conflicts: RebaseConflict[]; }
```
Algorithm (variant `V` deriving from `B0`, target `B1`, same recipe):
1. `changedByBase` = component keys whose value differs between `B0.content` and `B1.content`
   (added / removed / replaced).
2. `variantTargets` = keys the `overrideSet` touches (each entry's `target`, or added payload's
   `componentKey`).
3. `conflicts` = `variantTargets ∩ changedByBase`. `both-changed` → variant-wins, report `baseNew` vs
   `variantKept`. `base-removed` (B1 dropped a key V replaces/removes) → re-express V's intent as an
   `add` so the result is well-formed, report it.
4. New content = `materialize(B1.content, reconciledOverrideSet)`; recompute macros; write a new
   `RecipeVersion` with `prevVersionId = V.head`, `derivesFromVersionId = B1`. Reuse `assertAcyclic`
   if any reconciled slot is a sub-recipe.

**Service (`recipe-service.ts`).**
- `compare(versionIds: VersionId[])` → `CompareView`. Rejects `< 2` ids and unknown ids; never throws
  on partial macros.
- `promote({ targetVersionId, sourceVersionId, componentKeys, commitMessage? })` → `{ version }`.
  Reads each named component from the source's **resolved** content, auto-adds usages referencing a
  promoted slot (CM-4), builds add/replace `OverrideEntry`s, applies them via the existing
  `applyOverride` path (bakes into a root target, records a delta on a variant target). Errors: unknown
  component in source; a lifted usage referencing a step the target lacks.
- `rebase({ variantVersionId, ontoVersionId, commitMessage? })` → `RebaseResult`. Validates the variant
  *is* a variant (has `derivesFromVersionId`) and that `ontoVersionId` is the **same base recipe**
  (CM-6); else a directed error.
- `rebaseVariants({ baseVersionId, commitMessage? })` → `{ results: { recipeId; version; conflicts }[] }`
  (CM-8) — every variant of the base recipe rebased onto its head.
- `createRecipe` gains optional `parents?: VersionId[]` / `rationale?: string`, validated to exist and
  stored as `parentVersionIds` / `provenanceNote` (CM-7).

**CLI (`cli.ts`, `commands.ts`).**
- `batch compare <v1> <v2> [v3…]` → the `CompareView` JSON.
- `batch promote <targetVersionId> --from <sourceVersionId> --component <key>[,<key>…] [-m msg]`.
- `batch rebase <variantVersionId> --onto <baseVersionId> [-m msg]` → `{ version, conflicts }`.
- `batch rebase --all-variants <baseVersionId> [-m msg]` → per-variant results (CM-8).
- `batch create … --parents <a,b,c> --rationale "…"` (provenance on a synthesized champion). `tree`
  gains the `parentVersionIds` edges in its node output.

---

## 4. File map

**core**
- `src/types.ts` — add `parentVersionIds?` / `provenanceNote?` to `RecipeVersion`.
- `src/compare.ts` *(new)* — pure `buildCompareView(...)`: the ingredient-id matrix (CM-1/CM-2),
  column assembly, step lists.
- `src/rebase.ts` *(new)* — pure 3-way merge: base diff, conflict detection (`both-changed`,
  `base-removed`), reconciled override set (CM-5).
- `src/recipe-service.ts` — `compare`, `promote`, `rebase`, `rebaseVariants`; `createRecipe` provenance
  plumbing.
- `src/index.ts` — export `CompareView` / `CompareColumn` / `CompareIngredientRow` / `CompareStepList`,
  `RebaseResult` / `RebaseConflict`, and the pure builders for testing.

**cli**
- `src/commands.ts` — `compare`, `promote`, `rebase` (single + `--all-variants`); `create` provenance
  flags; `tree` node gains `parentVersionIds`.
- `src/cli.ts` — wire the `compare` / `promote` / `rebase` verbs and flags; `create --parents/--rationale`.
- `src/file-repository.ts` — **no method changes**; `parentVersionIds`/`provenanceNote` ride along as
  plain version fields (JSON round-trips). Confirm old-store load is untouched.

**skill**
- `.claude/skills/batch/SKILL.md` — an "M4: compare, promote, rebase" section teaching the loop (§5).

*No change* to `materialize.ts`, `compute-macros.ts`, `flatten.ts`, `sub-recipe.ts`, `units.ts`,
`repository.ts`, `in-memory-repository.ts` (interface) — M4 is new *compositions* of existing
primitives, not new primitives.

---

## 5. The agent loop (skill update)

The whole feature exists to power a conversation. The skill teaches:

1. **`compare`** the candidates → read the matrix: which ingredients diverge, the macro deltas, the
   verdicts. Infer what each divergent ingredient *does* and judge positive vs negative.
2. **Pick the champion.** Either **`promote`** the winning component(s) into an existing base (it just
   won), **or** **`create … --parents`** a freshly synthesized blend (a true amalgam of several).
3. **Establish the family.** `rebase --all-variants <champion head>` pushes the champion's improvements
   to its variants — clean changes flow in free; adjudicate any `conflicts[]` (converge vs keep-as-fork)
   with a follow-up `override`.
4. **Cross-root convergence (CM-6).** To fold an *unrelated* root into the champion's family, **don't**
   look for a merge command — `derive` from the champion and apply just the genuine differences you see
   in `compare` as `override`s. The result is a clean variant that shares structure, so step 3 keeps
   working forever after.

---

## 6. Testing strategy

**core (pure builders + service over `InMemoryRepository`)**
- **Compare matrix (`compare.ts`):** join by `libraryIngredientId` across *separate roots*; multi-usage
  aggregation (same ingredient in two usages sums per serving); `null` (absent) vs `"present"`
  (unconvertible unit) vs `number`; a sub-recipe ingredient rolls into the same row as a directly-added
  one (flatten transparency); verdicts/macros land on the right column; `< 2` ids and unknown id reject.
- **Rebase (`rebase.ts` + service):** clean propagate (base change V didn't touch flows in, zero
  conflicts); `both-changed` → variant-wins + reported; `base-removed` → re-added + reported; macros
  recomputed; `derivesFromVersionId` re-pointed to `B1`; same-lineage validation rejects a cross-recipe
  `--onto`; non-variant target rejected; `assertAcyclic` still guards a sub-recipe slot.
- **Batch (`rebaseVariants`):** every variant rebased onto base head; per-variant conflict reports
  independent.
- **Promote:** lifts named component(s) as overrides; auto-includes usages referencing a promoted slot;
  bakes into a root vs records a delta on a variant; errors on unknown component / usage→missing step.
- **Provenance:** `create --parents` stores `parentVersionIds`/`provenanceNote`; parents validated to
  exist; old-store load with neither field present is unaffected.

**cli**
- smoke each verb against a scratch store, asserting JSON shape including `conflicts[]` and the compare
  matrix; `create --parents/--rationale` round-trips through the file repo; `tree` shows the parent
  edges.
- one end-to-end: `compare` 3 roots → `promote` a winning ingredient into one → `rebase --all-variants`
  → assert the propagated content + any conflicts.

**TDD discipline:** red → green → refactor per unit; the pure builders (`compare.ts`, `rebase.ts`)
carry the heavy logic and the bulk of the tests.

---

## 7. Out of scope (YAGNI / later)

- **Mechanical cross-root merge.** Deliberately refused (CM-6). A later opt-in `--cross-root`
  *ingredients-only, best-effort* mode could align unrelated roots by ingredient-id for the *slot/usage*
  axis only (never steps), clearly labeled lossy — add only if the agent loop proves too tedious.
- **Three-way conflict *resolution* UI / interactive picking.** The report + a follow-up `override` is
  the resolution path; no conflict-resolution mode.
- **Auto-detecting the champion** (ranking recipes by verdict for you). `compare` surfaces the signal;
  the *choice* stays a conversation.
- **Promoting across families with key remapping**, or promoting whole step-sequences — `promote` lifts
  named components (and their usages); larger lifts are an agent `derive`+`override`.
- **Content-hash staleness / provenance beyond version-id edges** — `parentVersionIds` records the link;
  it does not track how far a parent has since advanced (that's the M3 staleness reading, applied later).
