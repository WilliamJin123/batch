# Batch — Recipe Feedback (the Tasting Log) — Design Spec

> **A feedback layer over Batch `core`.** Records what you actually baked and how it turned out —
> *to-make* intent, *made* outcomes with a rating, and component-level notes ("the lemon glaze
> needs work") — as an **append-only journal** that sits *beside* the recipe data and never
> touches the version chain, macros, or flatten.
> Status: **design approved, pre-implementation.** Date: 2026-06-15.

This is a small milestone slotted **before M4** (extract-base / rebase). It is motivated by real
dogfood signal: every recipe in the store has been baked and is "quite good," **except** Red Velvet
(untried — *to make*) and the lemon cookie's **glaze**, which "needs work." There is nowhere in the
substrate to record any of that today. Written to be read two ways: a **review artifact** (checkable
before code) and an **explainer** (the reasoning, not just the result). Every decision leads with *why*.

---

## 1. What this delivers

The substrate models *what a recipe is* (immutable versions, macros, composition) but records nothing
about *how it went when you made it*. This feature adds that observational layer:

1. **A tasting log (UC: "record feedback").** Append-only entries attached to the exact version you
   baked, each either a `to-make` intent or a `made` outcome carrying a 4-point rating + free notes.
2. **Component-level feedback.** An entry can target a single component (`--component sl-glaze`), so
   "the cookie is good but the glaze is weak" is captured as structured signal, not a margin note.
3. **Derived views — never stored.** *tried / untried*, the *to-make queue*, and the *current verdict*
   per recipe (and per component) all fall out of the log by a read-time rollup.
4. **CLI surface.** A `feedback` verb to append/list entries, markers on `list`, and a `list --to-make`
   queue.

**Driving cases (the real store, 2026-06-15):**
- Red Velvet → a `to-make` entry (baked by nobody yet; on the queue).
- The four tried recipes → `made` entries, mostly `good`.
- The lemon cookie → `made --rating good` on the dish **plus** `made --component <glaze> --rating bad`
  on the glaze — "good cookie, the glaze needs major work."

**Explicitly not an engine change.** No new version is written, no head advances, no macro recompute,
no materialize/flatten involvement. This is the first Batch subsystem that is *orthogonal* to the
version DAG — and keeping it that way is the central design constraint (DF-1, DF-6).

---

## 2. Key decisions (with rationale & alternatives)

### DF-1 — Feedback is its **own append-only collection**, not a field on a version
*Options:* (1) a `feedback` field/array on `RecipeVersion`; (2) reuse `tags` on a version; (3) a
separate top-level `feedback` collection in the `Db`, each record pointing at a `versionId`.
*Choice:* **(3).** *Why:* **versions are immutable** — every `override` / `editMetadata` / `recompute`
writes a *new* `RecipeVersion` and advances the head (`recipe-service.ts:155`, `:190`, `:260`). So
(1) and (2) are non-starters: adding a tasting note would have to *fork the recipe*, polluting the
version chain with feedback-only versions and coupling "I tasted it" to "the recipe changed." A
separate collection keeps feedback **append-only and orthogonal** — the same shape the rest of the
system already has (a log you append to, never mutate). It loads via the same
"normalize-missing-key" path `ingredients` uses (`file-repository.ts:24`), so **every existing store
opens unchanged** (pre-feedback stores simply have an empty map).

### DF-2 — **One journal, two kinds** (`to-make` | `made`) — intent and outcome unified
*Options:* (a) one append-only log whose entries are either intent or outcome; (b) a mutable per-recipe
`to-make` wishlist flag **plus** a separate outcome log; (c) outcomes only, defer the queue.
*Choice:* **(a).** *Why:* a `to-make` and a `made` are the *same noun at different lifecycle stages* —
observations about a dish, one forward-looking, one back. Unifying them means the **queue is derived,
not maintained**: "on my to-make list" = *the recipe's most-recent entry is a* `to-make`; logging a
bake **automatically retires the intent** with zero bookkeeping. (b) would reintroduce the one *mutable*
thing into an append-only world and make you remember to clear the flag. (a) also subsumes the
"queue an ablation experiment" need raised earlier — "try 50 g protein" is just a `to-make` on that
variant, the same gesture as "try Red Velvet."

### DF-3 — A **4-point ordinal** rating; `excellent` is the favorite tier; per-component ratings fall out
*Choice:* `bad < okay < good < excellent`, worst→best:

| rating | meaning |
|---|---|
| `bad` | major texture/taste issue — needs major tweaks |
| `okay` | generally fine, but some things need work |
| `good` | generally good |
| `excellent` | a standout — the **starred/favorite** tier of `good` |

*Why one ordinal axis, not two:* "favorite" is **not** a separate flag — it is simply `rating ===
"excellent"` (rendered `★` in `list`). Keeping favorite as the top rung avoids a second orthogonal
field that could contradict the rating (`bad` + favorite makes no sense). *Why per-component ratings
need no extra model:* a `made` entry can carry **both** a `componentKey` **and** a `rating`, so "dish:
good; glaze: bad" is two entries — one dish-scoped, one component-scoped. The structure that captures
the dish verdict captures the part-verdict for free.

### DF-4 — **Version-pinned, recipe-rolled-up**; derivation isolates
*Choice:* a record stores **both** `versionId` (the exact thing you tasted — provenance, and the frame
a `componentKey` is valid in) **and** `recipeId` (the lineage, for cheap rollup). *Why both:* "have I
tried Red Velvet?" is a question about the **dish** (scan all entries for the `recipeId`), but "what
exactly did I taste / which component" is a question about a **version**. Storing `recipeId` makes the
`list` rollup O(entries) with no `getVersion` per record, and survives even if a version were ever
pruned. *Isolation property:* `deriveVariant` mints a **new `recipeId`** (`recipe-service.ts:98`), so
rating the gooey cookie does **not** mark its chewy variant tried — correct, they are different bakes.
In-place edits (`override`/`recompute`) keep the same `recipeId`, so a recipe stays "tried" across a
macro correction — the feedback record stays pinned to the version you actually ate, but the dish reads
as tried.

### DF-5 — Corrections by **recency-supersede**; append-only; `rm` only for genuine garbage
*Options:* an explicit `supersedesId` link; latest-entry-wins by recency; hard delete.
*Choice:* **recency-supersede + a hard `rm` escape hatch**, no `supersedesId`. *Why:* the motivating
case is an evolving diagnosis — *"I thought it needed more X" → "actually Y fixed it."* With the
**most-recent entry per scope** treated as the *current* verdict (scope = `componentKey ?? dish`), you
simply append the new finding; the stale hypothesis drops out of the rollup but **stays visible in the
log as the diary trail** — the dead-end is worth not re-discovering. This needs no new field and mirrors
the version chain (latest supersedes, history preserved). A deliberate `feedback rm <id>` remains for
*true garbage* — logged the wrong version, a duplicate — **not** for superseding a hypothesis. This is
the one destructive op in the subsystem and is intentionally explicit.

### DF-6 — A **read-only, orthogonal** subsystem
*Choice:* nothing in this feature calls `computeMacros`, `materialize`, or `flattenContent`, writes a
`RecipeVersion`, or moves a head. `addFeedback` appends one record and returns; the derived views are
pure reads. *Why:* the value of feedback is that it is *cheap and frictionless* — recording a tasting
must never risk a recipe edit or a macro churn. This isolation is also what makes the whole feature
unit-testable as pure functions over a list of records.

---

## 3. Mechanics & data flow

**Types (`types.ts`).**
```ts
export type Rating = "bad" | "okay" | "good" | "excellent";   // ordinal, worst→best
export type FeedbackKind = "to-make" | "made";

interface FeedbackBase {
  id: string;
  recipeId: RecipeId;          // lineage — for rollup (DF-4)
  versionId: VersionId;        // the exact version tasted/queued (provenance)
  componentKey?: ComponentKey; // optional target within that version (e.g. sl-glaze)
  notes?: string;
  date: string;                // when baked/queued (ISO-8601; defaults to now, --date overrides)
  author: Author;              // default "user"
  createdAt: string;           // when the record was written (ISO-8601)
}

export type FeedbackEntry =
  | ({ kind: "to-make" } & FeedbackBase)                  // intent — no rating
  | ({ kind: "made"; rating?: Rating } & FeedbackBase);   // outcome — rating optional but encouraged
```
`rating` is optional even on `made` (you can log "I baked it" and rate later, or leave a pure note);
the discriminated union still forbids a rating on a `to-make`.

**Storage (`repository.ts`, `in-memory-repository.ts`, `file-repository.ts`).** The `Db` gains a
fourth map, `feedback: Record<string, FeedbackEntry>`, normalized on load exactly like `ingredients`
(absent key → `{}`), so old stores open unchanged. Four new `Repository` methods, each mirroring the
ingredient methods: `saveFeedback`, `getFeedback`, `listFeedback`, `deleteFeedback`.

**Service (`recipe-service.ts`).** Five methods, none of which write a version or move a head:
- `addFeedback(input)` — fills `id`/`createdAt`/`author`/`date` defaults from `deps`, resolves
  `recipeId` from `versionId` (validates the version exists), appends, returns the record.
- `feedbackForRecipe(recipeId)` / `feedbackForVersion(versionId)` — filtered reads, date-sorted.
- `feedbackSummary()` — the rollup that powers `list`: per recipe → `{ tried: boolean; queued:
  boolean; verdict?: Rating; }`, where `verdict` is the rating of the **most-recent dish-scoped
  `made`** entry, `tried` = any `made` exists, `queued` = the recipe's **most-recent entry overall is
  a `to-make`**.
- `deleteFeedback(id)` — the DF-5 hard escape hatch.
- *(internal)* `currentVerdicts(recipeId)` — most-recent `made` entry per scope (`componentKey ??
  "__dish__"`), used by `feedback --list` to show the live verdict for the dish and each component,
  with older entries marked as history.

**Tiebreak rule (pure, deterministic).** "Most recent" sorts by `date` desc, then `createdAt` desc —
so two entries dated the same day resolve by write order, never ambiguously.

**CLI (`cli.ts`, `commands.ts`).**
- `batch feedback <versionId> --made [--rating bad|okay|good|excellent] [-m "notes"]
  [--component <key>] [--date YYYY-MM-DD]` — append a `made` entry.
- `batch feedback <versionId> --to-make [-m "why"] [--date YYYY-MM-DD]` — append intent.
- `batch feedback <versionId> --list` — the log for that recipe: the current dish verdict, current
  per-component verdicts, then full history (superseded entries dimmed).
- `batch feedback rm <id>` — hard delete (DF-5).
- `batch list` — a marker per recipe from `feedbackSummary()`: `★` excellent · `good` · `okay` ·
  `⚠ bad` · `☐` queued (to-make) · blank = untried. (`queued` shown alongside a verdict when both hold.)
- `batch list --to-make` — only the queued recipes.

`--date` accepts `YYYY-MM-DD` and is widened to an ISO timestamp; omitted → `deps.now()`.

---

## 4. File map

**core**
- `src/types.ts` — add `Rating`, `FeedbackKind`, `FeedbackBase`, `FeedbackEntry`.
- `src/repository.ts` — add `saveFeedback` / `getFeedback` / `listFeedback` / `deleteFeedback` to the interface.
- `src/in-memory-repository.ts` — implement the four methods over a `Map`.
- `src/recipe-service.ts` — `addFeedback`, `feedbackForRecipe`, `feedbackForVersion`, `feedbackSummary`, `deleteFeedback`, internal `currentVerdicts`.
- `src/index.ts` — export the new types (and any pure helper, e.g. a `summarizeFeedback(entries)` if factored out for testing).

**cli**
- `src/file-repository.ts` — add `feedback` to the `Db` interface + `load()` normalization; implement the four methods (mirrors the ingredient block).
- `src/commands.ts` — `feedback` command (append / list / rm); `list` rollup + `--to-make` filter.
- `src/cli.ts` — wire the `feedback` verb, its flags, and the `list --to-make` flag.

**skill**
- `.claude/skills/batch/SKILL.md` — a "recording feedback" section: the to-make→made lifecycle, the
  rating scale, component-targeted notes, recency-supersede, and the `list` markers.

*No change* to `compute-macros.ts`, `materialize.ts`, `flatten.ts`, `sub-recipe.ts`, `scale.ts`,
`units.ts` — the orthogonality of DF-6 made visible as an empty diff.

---

## 5. Dogfood plan (record the real signal)

Run against a **scratch store first** (`BATCH_DB=/tmp/...`), then the real `~/.batch`, and fold the
commands into `reseed.sh` so the verdicts reproduce:

1. **Queue Red Velvet** — `feedback <RV head> --to-make -m "made the cookie part, not yet the full bake"`.
   Confirm `list` shows `☐` and `list --to-make` lists only Red Velvet.
2. **Log the good ones** — a `made --rating good` on the cheesecake, birthday-cake, browned-butter
   cookies. Confirm `list` markers flip to `good`, and Red Velvet leaves the to-make set only if a
   `made` is later added (it is not — it stays queued).
3. **The lemon split** — `feedback <lemon head> --made --rating good -m "cookie itself is great"`
   **and** `feedback <lemon head> --made --component <glaze key> --rating bad -m "glaze too weak/thin,
   needs work"`. Confirm `feedback <lemon head> --list` shows dish=`good`, glaze=`bad`.
4. **Supersede demo** — append a later component note on the glaze (`--rating okay -m "more zest +
   less water helped"`); confirm the **current** glaze verdict reads `okay` while the `bad` note
   remains in history (DF-5).
5. **Mark a favorite** — bump one genuinely-loved recipe to `excellent`; confirm `★` in `list`.

---

## 6. Testing strategy

**core (pure / service over `InMemoryRepository`)**
- `feedback` summary logic (factored pure where practical): tried/untried; queued = latest entry is
  `to-make`; verdict = latest dish-scoped `made`; recency tiebreak by `date` then `createdAt`.
- `addFeedback` — resolves `recipeId` from `versionId`; rejects an unknown `versionId`; fills
  defaults; **does not** write a new `RecipeVersion` or move the head (assert version count unchanged).
- recency-supersede — two component entries; `currentVerdicts` returns the newer; both present in
  `feedbackForRecipe`.
- derivation isolation — feedback on a base does **not** mark a derived variant tried (distinct
  `recipeId`); in-place `override` keeps the recipe tried.
- `deleteFeedback` — removes the one record, leaves others.
- old-store load — a `Db` JSON without a `feedback` key loads to an empty map (file-repository).

**cli**
- smoke: `feedback --made/--rating/--component/--date`, `--to-make`, `--list`, `rm`; `list` markers;
  `list --to-make` filter — each against a scratch store.
- the §5 dogfood steps 1–3 as an end-to-end CLI test asserting the rendered markers/verdicts.

**TDD discipline:** red → green → refactor per unit, smallest a meaningful test at a time.

---

## 7. Out of scope (YAGNI / later)

- **Editing entries in place** — append-only; a typo gets a corrected (superseding) entry or `rm`.
- **A numeric 1–5 scale, multi-axis ratings, photos, multi-user/attribution beyond `author`.**
- **An explicit `supersedesId` link** — recency covers the one real case (DF-5); add only if a
  cross-scope supersede ever appears.
- **Feedback influencing macros, sort order, or recommendations** — the subsystem stays observational
  (DF-6). Surfacing "needs-work" recipes as M4 rebase candidates is a *reading* of this data, later.
- **Extracting the lemon glaze into a sub-recipe** so its feedback rolls up like the frosting — a nice
  follow-on, but it is an **M3 composition** action, not part of this feature.
