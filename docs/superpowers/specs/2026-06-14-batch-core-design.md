# Batch `core` — Design Spec

> **Sub-project #1 of Batch: the recipe substrate.**
> The versioned, forkable data model + macro engine that every other part of Batch stands on.
> Status: **design approved, pre-implementation.** Date: 2026-06-14.

This document refines the high-level vision in [`batch-spec.md`](../../../batch-spec.md) into a buildable design for the foundational layer. It is written to be read two ways: as a **review artifact** (so the design can be checked before code exists) and as an **explainer** (so the reasoning — not just the result — can be walked through end to end, e.g. in a technical interview). Every section leads with *why*, not only *what*.

---

## 1. Context & motivation

The author's real workflow today, in a consumer recipe-notes app:

1. **Source** a recipe — usually an Instagram reel (recipe in the caption, occasionally a pinned comment) or a blog post.
2. **Parse** it into the notes app (a black box; no macros, no structure beyond text).
3. **Tune** it in a *separate* Claude conversation — adjusting ingredients and macros toward a goal (higher protein, lower calorie, a target texture).
4. **Re-enter** the tuned result *by hand* back into the notes app.
5. **Track**, loosely, what's been made vs. not, and which versions were any good.

Three pain points fall out of this, and they define what `core` must fix:

- **The tuning loop is disconnected.** The reasoning happens in one tool; the record lives in another; the bridge is manual retyping. Context, lineage, and rationale are all lost in the gap.
- **There is no lineage.** A "banana cheesecake" tuned out of a "protein cheesecake" has no recorded relationship to its parent, and no way to factor out a reusable base to spawn siblings (Biscoff, etc.).
- **Macros are guessed, not computed**, and never attached to a specific version.

**Batch treats recipes as code:** versioned, diffable, branchable objects, with an AI agent as a collaborator that *proposes* changes the human *approves*. `core` is the substrate that makes "recipes as code" literally true — the data model and operations for versioning, derivation, composition, and macro computation. The agent, the import pipeline, and the UI are separate sub-projects built on top of it.

---

## 2. Scope

### Where `core` sits

Batch decomposes into four sub-projects, built in this order:

1. **`core` — the substrate + macro engine** ← *this spec.* Pure domain logic. No UI, no network, no agent.
2. **`batch` CLI + skill** — the agent's hands. A thin CLI over `core`, wrapped by a Claude skill (token-efficient; preferred over an MCP server, which is demoted to an optional later adapter). After (1)+(2), the whole tune → propose → approve → extract-base loop is usable **headlessly through Claude Code**, before any web UI exists.
3. **Import pipeline** — blog URL / reel caption / pinned comment / screenshots → `core` objects, AI-normalized. (Instagram caption fetching is the genuinely fragile part — real ToS/API limits — and is designed when we reach this slice.)
4. **Web app** — tree view, editor, diff/approval, cooking mode, embedded chat, plus the cook-log.

### In scope for `core`

The full operation contract is enumerated in §4 as `UC1–UC27`. In brief: recipe lifecycle & immutable history; the variant/inheritance model (fork, override, rebase-propagation, extract-base); composition via sub-recipe slots; the macro engine (library + USDA resolution, unit conversion, sub-recipe recursion, per-version snapshots); structured diff; and draft/approve status + authorship as data.

### Explicitly out of scope

- **Import parsing** (a pipeline concern; `core` only exposes a structured *ingest* API).
- **The approve/reject *UI flow*** (`core` only stores `status`).
- **The cook-log / made-unmade tracking** (a usage-layer table that merely references `core`'s version IDs — see §8).
- **Full-text search infrastructure**, **Cooklang `.cook` export**, **multi-user/auth**, and **social features** — all future.
- **Field-level overrides** and **bake-time interpolation** — deliberate future refinements (see §9).

---

## 3. Core concepts (the mental model)

**Recipes are versioned, forkable objects — "git for recipes."** A base recipe is a root commit; variants are branches; modifications are diffs; the agent opens pull requests.

Two independent axes run through the model. Keeping them separate is the single most important conceptual move in the design:

- **Composition (the sub-recipe DAG).** A recipe *contains* others. A tiramisu has a "ladyfingers" slot; that slot resolves to either a store-bought ingredient or a full homemade sub-recipe. Macros recurse through it. This makes the structure a directed acyclic graph.
- **Derivation + history (the variant model).** A recipe *varies* (banana cheesecake derives from a cheesecake base) and *evolves* (banana cheesecake v3 after re-tuning). These are **two different edges**, and conflating them is a modeling smell we explicitly avoid.

### The central reconciliation: snapshot *and* inheritance

The hardest early question was whether a variant is a **git-style snapshot** (fork = independent copy; base edits don't propagate) or a **class-style inheritance** (child inherits live from parent; base edits flow through to non-overridden fields).

The answer is **both, and git already proves they're compatible:** immutable commits + branches stored as diffs + rebase to pull upstream changes in. Concretely:

- **Versions are immutable.** Every edit is a new version; old versions never change. *(snapshot)*
- **Variants are stored as deltas.** A variant records only its *overrides* against a parent version; everything it doesn't override is inherited. *(inheritance)*
- **Propagation is a rebase.** When a base improves, the variant's override set is re-applied on top of the new base version to produce a *new* variant version — the old one stays in history. Crucially, the agent does this *intelligently*, not mechanically: "base bake temp went 325→350°F, but this variant uses cottage cheese, which sets softer — proposing 340°F for it, not a flat 350." *(reconciliation)*

This is why "I want snapshots" and "I want base changes to cascade" are not in conflict. They're the two halves of git's model.

---

## 4. The use-case contract (`UC1–UC27`)

Every operation `core` must support. Entities (§6) and operations (§7) trace back to these IDs.

**A. Recipe lifecycle & history**
- `UC1` Create a recipe from scratch → root recipe + first version.
- `UC2` Ingest a recipe from *structured input* → new root version. *(core defines the ingest API; producing the structured data is the import pipeline's job.)*
- `UC3` Edit a version → new immutable version (history edge) + author + commit message.
- `UC4` Resolve a version → fully materialized recipe (steps with inline ingredient usages, quantities, prep states), inheritance applied.
- `UC5` Resolve **and scale** a version to a target serving count.
- `UC6` Navigate history: walk the temporal chain; undo = read the parent version.

**B. Derivation / variants — the inheritance DAG**
- `UC7` Derive a variant from a base version → stores an *override set*, inherits the rest.
- `UC8` Override a component (ingredient swap, quantity, step) → recorded in the override set; pins that component.
- `UC9` Resolve a variant = base (recursively) + overrides applied.
- `UC10` **Extract-base** → factor a generic base out of a concrete recipe; re-parent the concrete one as overrides; content-preserving. *(bottom-up)*
- `UC11` **Rebase** a variant onto a newer base version → re-apply overrides → new variant version (with a hook for agent-adjusted overrides).
- `UC12` Staleness query: "this variant's base is N versions ahead" (drives the pull-default badge).

**C. Composition — the sub-recipe DAG**
- `UC13` A slot resolves to *either* a raw ingredient *or* a sub-recipe (interface → implementation).
- `UC14` Swap a slot's implementation (store-bought ↔ homemade) → new version.
- `UC15` Cycle-safety: reject a composition that would create a DAG cycle.

**D. Macros, units & the ingredient library**
- `UC16` Ingredient library CRUD: cached macros, aliases, per-serving defs.
- `UC17` Resolve an ingredient's macros: personal library → USDA → agent-assisted entry.
- `UC18` Compute a version's macros: scale each usage, sum, **recurse through sub-recipe slots**.
- `UC19` Snapshot computed macros onto the version (immutable; old versions keep their numbers).
- `UC26` Canonical **yield** per version (the baseline scaling and per-serving macros divide by).
- `UC27` **Units + conversions** (universal table + per-ingredient density; dual display).

**E. Diff, status & authorship — the PR-model substrate**
- `UC20` Diff two versions → structured (ingredient changes + step changes + macro delta).
- `UC21` Version status ∈ {draft, approved, rejected}; create drafts without disturbing the live tree.
- `UC22` Every version records author (user | agent) + commit message.
- `UC23` **Annotation layer**: freeform rationale notes attachable to a usage, an override, or a library ingredient.
- `UC24` Recipe **tags** (desserts, brownie, savoury, sweet…) for filtering.
- `UC25` Steps carry structured **time/temperature** (plus a recipe may hold freeform batch-size calibration notes).

---

## 5. Key design decisions (with rationale & alternatives)

The interview-facing heart of the spec: each decision states the options weighed, the choice, and *why*.

### D1 — Snapshot vs. inheritance → **reconciled via git's model**
*Options:* (a) pure snapshots (forks are frozen copies), (b) pure live inheritance (children recompute from parents). *Choice:* immutable versions **+** delta-stored variants **+** rebase propagation. *Why:* the user wants both "frozen history" and "base improvements cascade." Git proves these coexist: immutable commits, diff-stored branches, rebase. See §3.

### D2 — Propagation timing → **pull-default with a staleness badge + batch rebase**
*Options:* push (auto-generate rebase drafts on every base commit) vs. pull (variants stay pinned until you act). *Choice:* pull by default; a variant behind its base wears a "base is N versions ahead" badge; the base has a "rebase all descendants" action that batch-fires agent proposals *when you choose*. *Why:* the workflow has a heavy base-tuning phase (no variants yet → push is moot) followed by a stable-base phase (many variants → push would pile up `N × variants` drafts to triage). Pull avoids the draft-spam; the badge avoids pull's "I forgot what's stale" failure. It's also strictly simpler to ship than auto-push, and upgradeable later.

### D3 — Variant storage → **hybrid: declared overrides as truth + materialized snapshot cache**
*Options:* (1) git-style full snapshots per version, (2) class-style declared overrides, (3) hybrid. *Choice:* **(3).** Source of truth = derivation pointer + an explicit override set; at commit, the fully-resolved recipe + computed macros are *materialized and snapshotted* onto the version. *Why:* declared overrides give **exact** pin/rebase semantics (option 1 can only *infer* overrides by diffing — heuristic, not exact) and make variants first-class and extract-base natural; the materialized snapshot buys option 1's instant reads + bulletproof immutability. Cost: two representations + one disciplined commit path. This is the literal schema form of D1's reconciliation — "store the delta as truth, snapshot the resolved result."

### D4 — Variant identity → **each variant is its own first-class recipe, with two edges**
*Options:* a variant is a branch *inside* one recipe's version DAG, vs. a variant is its own named recipe. *Choice:* its own recipe, carrying two distinct edges — `derives_from_version_id` (inheritance, across recipes) and `prev_version_id` (history, within a recipe). *Why:* the user names, tags, rates, and cook-logs "Banana Cheesecake" and "Biscoff Cheesecake" as distinct things. Branches-inside-one-recipe fights that; separate recipes model it directly. Separating the two edges is what lets us track a variant independently *and* pull base improvements into it.

### D5 — Override granularity → **component-level** (whole step / whole slot)
*Options:* component-level (own a whole step or slot) vs. field-level (own a single field). *Choice:* **component-level for v1.** *Why:* simpler to store, diff, and display, and it matches how people think ("I changed the sugar"). The case where field-level wins — the base adds "rotate pan halfway" to a bake step you'd re-timed, and you want both — is exactly a **rebase conflict**, where the agent surfaces the base's change and offers to fold it in. So component-level storage + smart rebase recovers most of field-level's upside without the machinery. Field-level remains a future refinement if coarseness bites.

### D6 — Quantities live on **usages, not slots**
*Choice:* a slot is purely the named *requirement* + swap point; quantities live on `step_usage` ("150 g in step 2, 50 g in step 5"); a slot's total is *derived* by summing usages. *Why:* "ingredients live in steps" (a core principle), and it removes a redundant slot-total that would need syncing.

### D7 — Components carry a **stable `component_key` across versions**
*Choice:* when a step/slot is carried into a new version, its `component_key` persists (only `order`/fields change). *Why:* overrides and diffs must track *the same component* across versions even when steps get reordered or inserted. This is what makes rebase a real 3-way merge and diffs precise rather than positional.

### D8 — Units → **gram-canonical; universal table + per-ingredient density; dual display**
*Choice:* macros compute in grams. Volume↔volume and mass↔mass conversions are a static universal constant; volume↔mass *always* routes through the ingredient's `unit_equivalences` (e.g. "1 tbsp butter = 14 g"), because density is ingredient-specific (a cup of flour ≠ a cup of water). A usage stores its quantity *as entered* and displays *both* ("1 cup (120 g)"). *Why:* "1 cup of a compressible thing" is exactly the pain point; gram-first is the cure, density is the convenience bridge for recipes that *arrive* in volume. The per-ingredient equivalences are seeded from USDA portion data → agent → user, so they ride on the ingredient rather than being a separate table to maintain.

### D9 — Ingredient library is **mutable; immutability is protected by the macro snapshot**
*Choice:* `library_ingredient` is a plain mutable row (not versioned). Editing it does **not** retroactively change any version's snapshot, because each version froze its own numbers at commit (`UC19`). When you fix an ingredient, a **recompute** action folds corrected data in by creating a *new version* (`author=system`); a "macros may be stale" badge makes it discoverable. *Why:* versioning ingredients would be heavy and redundant — the snapshot already gives reliable history and diffs; opt-in recompute keeps the immutable chain intact while letting corrections through on demand.

### D10 — Extract-base is a **content-preserving re-parent**
*Choice:* the agent proposes a partition of a concrete recipe's components into {generic base, variant-specific}; `core` creates the base recipe and re-creates the original as a variant whose override set reproduces it exactly, enforcing the invariant `resolve(new_variant) == resolve(original)` before committing. *Why:* extraction must never silently change the recipe you already have; the invariant is the safety guarantee. This makes the *bottom-up* workflow (make a concrete thing, then factor out the base) first-class, not just top-down.

### D11 — Ingredient *function* knowledge → **agent on-demand, not a stored encyclopedia**
*Choice:* generalizable food science ("sugar adds chew, develops gluten") is supplied by the agent on demand, not stored as a maintained field. The `annotation` layer (`UC23`) stores only what the agent *can't* reconstruct: recipe-specific rationale ("the brown sugar carries the chew here") and personal quirks ("my whey gets chalky past 60 g"). *Why:* a static food-science DB duplicates the model and goes stale; rationale/intent is the part worth persisting and is exactly what's lost in the current workflow.

### D12 — "Made vs. unmade" is **derived from the cook-log, not a tag**
*Choice:* tags (`UC24`) describe what a recipe *is*; "made" describes what you've *done* with it, derived from the out-of-core cook-log (does any version have ≥1 cook entry). *Why:* a "made" tag would rot instantly (hand-toggled forever). Because cook entries attach to a *version*, the tree also shows *which experiments you actually made and rated*.

### D13 — Bake-time scaling is **empirical, not computed; texture-by-time is just a variant**
*Choice:* quantity scaling is linear (`UC5`); bake *time* is not (it depends on pan geometry, depth, oven), so it's recorded as empirical calibration notes the agent can interpolate from — never invented. A "cakey" vs "fudgy" version that differs only in bake time is just a variant overriding one step (`UC7/UC8`) — no new mechanism. *Why:* computing non-linear bake time would be confidently wrong; the substrate already expresses texture variants for free. The smart interpolation is deferred; only the data hooks are built now: structured step time/temp (`step.timer_seconds` / `temperature`), and freeform batch-size calibration recorded as **version-level annotations** (`UC23`, `target.type = recipe_version`) — no dedicated entity.

---

## 6. Entity model

> Convention: `?` = nullable/optional. Each entity is tagged with the use cases it serves. "Materialized content" rows exist for **every** version (they are the resolved snapshot in normalized, queryable form); for **root** versions they are also the authored source, while for **variant** versions the authored source is the `override_set` and the materialized rows are *generated* at commit.

### `recipe` — stable identity only
Everything mutable is versioned (git-style), so the identity row is deliberately thin.

| field | notes |
|---|---|
| `id` | |
| `created_by` | user \| agent |
| `created_at` | |
| `head_version_id` | the current live tip (convenience; the version tree is the source of truth) |

### `recipe_version` — the immutable snapshot
`UC1–UC12, UC19, UC21, UC22, UC24, UC26`

| field | notes |
|---|---|
| `id` | |
| `recipe_id` | → `recipe` |
| `prev_version_id?` | **history edge** — previous version of *this* recipe (`UC3/UC6`) |
| `derives_from_version_id?` | **inheritance edge** — a specific version of a *base* recipe; `null` ⇒ root (`UC7`) |
| `name`, `description`, `tags[]` | versioned content (`UC24`); rename/retag is a diffable change |
| `yield {amount, unit}` | `UC26` — baseline for scaling & per-serving macros |
| `status` | draft \| approved \| rejected (`UC21`) |
| `author` | user \| agent (`UC22`) |
| `commit_message` | `UC22` |
| `override_set?` | present iff variant (`derives_from` set) — see below (`UC8`) |
| `computed_macros` | snapshotted macro breakdown: total, per-serving, per-ingredient (`UC19`) |
| `created_at` | |

The **materialized content** (`step` / `ingredient_slot` / `slot_resolution` / `step_usage` rows tagged with this `version_id`) is the normalized `resolved_snapshot`. Reads, diffs, and macro computation operate on it uniformly, regardless of root vs. variant.

### `override_set` — a variant's declared deltas (`UC8`, component-level)
A list of entries, each one of:
- **`replace <component_key>`** — new field values / new `slot_resolution` (covers ingredient swap, quantity change, step edit, time tweak).
- **`remove <component_key>`** — drop a base step/slot.
- **`add`** — a brand-new component (receives a fresh `component_key`).

Plus version-level field overrides (`name` always; optionally `yield`, `tags`). Each entry targets a base `component_key` (D7), which is what lets it survive base reorders and lets rebase locate it.

### `step` — an ordered instruction
`UC4, UC25`

| field | notes |
|---|---|
| `id`, `version_id` | |
| `component_key` | stable across versions (D7) |
| `order` | mutable position |
| `instruction_text` | |
| `section?` | "Crust" / "Filling" / "Assembly" |
| `timer_seconds?`, `temperature?` | structured time/temp (`UC25`) |

### `ingredient_slot` — the interface
`UC13, UC14`

| field | notes |
|---|---|
| `id`, `version_id`, `component_key` | |
| `name` | "sugar", "ladyfingers" — the named requirement |
| `prep_default?` | optional default prep state |

A slot holds **no quantity** (D6) — it's the requirement + the swap point.

### `slot_resolution` — the implementation
`UC13, UC14, UC15`

| field | notes |
|---|---|
| `slot_id` | → `ingredient_slot` |
| `kind` | raw \| sub_recipe |
| `library_ingredient_id?` | when `raw` |
| `sub_recipe_version_id?` | when `sub_recipe` — **pins a specific version** (so a shared glaze goes "1 version behind", `UC12`); cycle-checked (`UC15`) |

### `step_usage` — ingredient-in-step (the join)
`UC4, UC27`

| field | notes |
|---|---|
| `id`, `version_id` | |
| `step_id`, `slot_id` | (via component_keys) |
| `quantity_value`, `quantity_unit` | **as entered** (`UC27`); source of truth for dual display |
| `prep_state?` | "softened", "melted" — display/technique only, **not** a macro transform (v1) |

### `library_ingredient` — personal macro/density cache (mutable; D9)
`UC16, UC17, UC27`

| field | notes |
|---|---|
| `id`, `name`, `aliases[]` | aliases let "my protein powder" resolve |
| `brand?` | |
| `macros_per_100g` | {calories, protein, carbs, fat, fiber} — canonical basis |
| `serving {size, unit, name}?` | "30 g scoop" |
| `unit_equivalences[] {unit → grams}` | the volume↔mass density bridge (`UC27`, D8) |
| `notes?` | personal rationale/quirks (`UC23`) |
| `source`, `usda_fdc_id?` | provenance: user \| usda |

### `annotation` — rationale layer (`UC23`, D11)
| field | notes |
|---|---|
| `id` | |
| `target {type, id}` | a `step_usage` \| `override_entry` \| `library_ingredient` \| `recipe_version` |
| `text` | freeform; never required |
| `author` | user \| agent |

Annotations on versioned content travel inside the snapshot; annotations on the library are mutable with it.

### Universal conversions — *not an entity*
A static constant table in code: volume↔volume and mass↔mass ratios (`tsp/tbsp/cup/floz/ml`, `g/kg/oz/lb`). Volume↔mass never appears here — it always routes through an ingredient's `unit_equivalences` (D8).

---

## 7. Core operations

Pure functions over the entities. The CLI/skill, agent, and UI all call these.

### `resolve(version) → MaterializedRecipe` (`UC4, UC9`)
- Root (`derives_from` null): the materialized rows *are* the recipe.
- Variant: `resolve(derives_from)` recursively → apply `override_set` (remove → drop; replace → swap fields; untouched → inherit) → append additions. The result is materialized and stored at commit.

### `scale(version, target_servings) → MaterializedRecipe` (`UC5`)
Resolve, then multiply every `step_usage.quantity` by `target_servings / yield.amount`. Linear only; bake time is **not** scaled (D13).

### `derive_variant(base_version, name) → recipe_version` (`UC7`)
Create a new `recipe` + a first version with `derives_from = base_version`, empty `override_set` (except `name`).

### `apply_override(variant_version, entry) → recipe_version` (`UC8`)
A new variant version with the entry merged into the `override_set`; re-materialize + re-snapshot macros.

### `rebase(variant, new_base_version) → recipe_version` (`UC11`) — a component-level 3-way merge
Inputs: `base_old` (variant's current `derives_from`), `base_new`, the variant's `override_set`. For each override entry, locate its `component_key` in `base_new`:
- **present, base unchanged since `base_old`** → apply cleanly.
- **present, base *also* changed it** → conflict (both edited) → surface to agent/user.
- **absent (base removed/renamed it)** → conflict (orphaned override) → surface.
- `base_new` components no override targets → **inherited automatically** (this *is* propagation).
Output: a new variant version, `derives_from = base_new`, override set possibly agent-adjusted, re-materialized. This is exactly where D1's "intelligent rebase" reasoning plugs in.

### `extract_base(concrete_version, partition) → {base_recipe, rewritten_variant}` (`UC10`, D10)
Given a partition of the concrete recipe's components into {base, variant-specific}: create base recipe `B` (root version from the base components); re-create the concrete recipe as a variant of `B` whose `override_set` replays the variant-specific components. **Enforce `resolve(rewritten_variant) == resolve(concrete_version)`** before committing — content-preserving guarantee.

### `compute_macros(version) → MacroBreakdown` (`UC18, UC19`)
Resolve → for each `step_usage`: convert quantity → grams (universal conversion if same dimension, else the ingredient's density); **raw** → `grams × macros_per_100g / 100`; **sub_recipe** → compute *its* macros per gram-of-yield × grams used (**recurses**; terminates by `UC15` cycle-safety). Sum → divide by `yield` for per-serving. Missing macros/density don't throw — return a **partial result + an "unresolved: need gram weight / macros for X" list** the agent fills via the `UC17` ladder. Result is snapshotted onto the version.

### `diff(version_a, version_b) → StructuredDiff` (`UC20`)
Match the two materialized snapshots by `component_key` → added / removed / changed components + the `computed_macros` delta. Component_keys make this precise (tracks moves & edits, not just positions).

### `staleness(pin) → int` (`UC12`)
Applies to **both** version-pinning edges — a variant's `derives_from_version` and a slot's `sub_recipe_version_id` — since both pin a specific base version and can fall behind. Count the versions between the pinned version and that base recipe's `head_version`. `> 0` ⇒ the "N versions behind" badge; drives "rebase all descendants" (for variants) and the shared-sub-recipe "glaze is 1 version behind" prompt (for composition).

---

## 8. Architecture & packaging

- **Monorepo, one repository** (not two). `core` is forbidden from importing UI/agent code; the boundary is real and enforceable, without cross-repo version coordination. Extract `core` into its own package only if something external ever needs to build on it (YAGNI until then).

```
batch/
  packages/
    core/        # this spec — entities, operations, macro engine; pure logic
    cli/         # the `batch` CLI over core
  skills/
    batch/       # SKILL.md wrapping the CLI (primary agent surface)
  apps/
    web/         # later — Next.js, consumes core + the skill via the Agent SDK
```

- **Language: TypeScript** — one language across `core` / CLI / skill / eventual web (Next.js + Agent SDK); Cooklang has TS/WASM bindings.
- **`core` is pure domain logic behind a repository interface** — unit-testable with no database. Production adapter: **Postgres** (Supabase/Neon). A **SQLite/in-memory** adapter is a fast-start option for early dogfooding; the interface is identical.
- **Agent surface: a skill, not an MCP server** — token-efficient (a skill costs one description line until invoked; an MCP server loads every tool schema permanently). The same CLI underlies both, so an MCP adapter can be added later if a surface needs typed tool-calls. The Agent SDK loads skills directly, so the eventual web chat reuses the same skill.
- **Core/usage boundary (the cook-log).** Made-unmade tracking and ratings live in a separate usage table — `cook_log {version_id, cooked_at, rating, notes, photo?}` — *outside* `core`. `core`'s only obligation is to expose stable `version_id`s for it to reference. "Made" = any version of the recipe has ≥1 entry.

---

## 9. Out of scope / future

Deliberately deferred, with the hooks left in:
- **Field-level overrides** (D5) — if component-level coarseness bites.
- **Bake-time interpolation** (D13) — the calibration *data* is captured; the interpolation engine is later.
- **Cook-log, import pipeline, web UI, Cooklang export, auth, social** — separate sub-projects (§2).
- **Cooked-vs-raw macro transforms** — `prep_state` is display-only in v1; modeling water-loss/density shifts is a rabbit hole.

---

## 10. Open questions / risks

Honest unknowns to resolve during implementation:
1. **Recompute UX (D9).** When an ingredient is corrected, how aggressively do we surface "N recipes affected — recompute?" — silent badge vs. active prompt. Leaning badge.
2. **Rebase-conflict resolution UX (D5/`UC11`).** The data model produces conflicts cleanly; the *interaction* for resolving them (agent-proposed, human-approved) needs design when the agent sub-project lands.
3. **USDA portion-data coverage (D8).** How often USDA lacks a usable gram-weight for a needed volume unit, forcing agent/user entry. Affects how much the density bridge leans on the agent.
4. **Materialized snapshot storage.** Normalized rows (queryable) vs. a JSON blob (simpler) for the resolved snapshot. Defaulting to normalized rows for "find all recipes using ingredient X"; revisit if it complicates the commit path.

---

## 11. Glossary

- **Recipe** — a stable named identity; a container for versions.
- **Version** — an immutable snapshot of a recipe at one point in time.
- **Variant** — a recipe that *derives from* a base version, storing only its overrides.
- **Root** — a version with no `derives_from`; stores full authored content.
- **History edge (`prev_version`)** — links a version to the previous version of the *same* recipe.
- **Inheritance edge (`derives_from`)** — links a variant version to a specific version of its *base* recipe.
- **Slot** — a named ingredient requirement (the interface) + the swap point.
- **Resolution** — what satisfies a slot: a raw library ingredient or a pinned sub-recipe version.
- **Usage** — an ingredient-in-a-step: slot + quantity (as entered) + prep state.
- **Override set** — a variant's declared, component-level deltas against its base.
- **Resolve / materialize** — compute a variant's full recipe by applying overrides onto its (recursively resolved) base.
- **Rebase** — re-apply a variant's overrides onto a newer base version (a 3-way merge); the propagation mechanism.
- **Extract-base** — factor a generic base out of a concrete recipe, re-parenting it content-preservingly.
- **Snapshot** — the materialized content + computed macros frozen on a version at commit.
