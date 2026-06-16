# Inspirations: Cooklang & doneness-diagram recipes

> **Status: investigation notes, NOT a commitment to build.** Captured 2026-06-16 before
> resuming the roadmap (M4 real-recipe dogfood → AI import). These are design seeds to
> draw from later, ranked by leverage. Nothing here changes the substrate yet.

## The throughline (why these two, together)

Batch is excellent at the **recipe-as-data**: the formula, deterministic macros, immutable
versions, base→variant derivation, pinned composition, tasting feedback. The two inspirations
both poke at the *same blind spot* — Batch under-serves the **recipe-as-lived-process**, at
its two ends:

- **Cooklang → the INPUT end.** Authoring is painful because Batch's only front door is
  hand-written JSON. Cooklang is the missing *front door*: a human-friendly text projection
  that parses **into** the substrate. It also de-risks AI import (LLM emits `.cook`, a
  deterministic parser turns it into `RecipeContent`).
- **Doneness diagrams → the EXECUTION end.** A linear list of instruction strings can't tell
  you *when it's done* or *what to do when it's wrong*. The under/right/over checkpoint +
  feedback loop is the missing *execution model*.

And the punchline that ties them to what Batch already is: **the "flowchart of related
recipes" Benjamin the Baker sells is literally already Batch's base→variant tree.** The
substrate in the middle is solid; these are the two ends of the lifecycle to extend, *if* we
choose to.

---

## Part A — Cooklang (cooklang.org)

**What it is.** A plain-text recipe markup language. Each `.cook` file is English prose with
inline markup: `@ingredient{qty%unit}`, `#cookware{}`, `~timer{q%unit}`, `>> key: value`
metadata, `= Section =`, `(prep notes)`, `-- comments`. Each blank-line-separated paragraph is
one step; ingredients appear inline where used (no separately-maintained ingredient list).

**Sample:**
```cook
>> servings: 2
= Sauce =
Heat @olive oil{2%tbsp} in a #frying pan over medium heat.
Stir in @canned tomatoes{400%g} and @salt{=1%tsp}. Simmer ~{15%minutes}.
```

**Parsed model — the key insight.** A step is *not* a flat string; it's an ordered list of
**typed tokens** (text / ingredient / cookware / timer), where each ingredient token carries an
`index` back into a dedup'd `ingredients[]` array. "The olive oil in step 1" *is* the same
entity as in the ingredient list because it's the same source token. **This is nearly 1:1 with
Batch's normalized `steps[] / slots[] / usages[]`** — which independently validates our model.

**What it deliberately is NOT** (all confirmed in their design blog/spec):
- **Nutrition** — *explicit non-goal*, "left to external databases."
- **Versioning / derivation / overrides** — none; "versioning" = put the file in git.
- **Sub-recipes** — only a *textual include* (`@@name`, `@./path`); no pinned snapshot, no
  rolled-up macros, no staleness.
- **Doneness / branching / conditionals** — none; steps are linear prose.
- Scaling, unit conversion, shopping lists exist only as **tool-level** features (in
  cooklang-rs / CookCLI), not in the language.

**Ecosystem.** Living spec (formal EBNF + conformance tests, no frozen version). Canonical
parser **cooklang-rs**; official **cooklang-ts** (TypeScript — directly usable by Batch);
CookCLI (shopping lists, web import) actively maintained (v0.29.1, Apr 2026). Apps: Cook
(iOS/Android), Obsidian/VS Code plugins, tree-sitter grammar.

### `.cook` → Batch mapping (concrete)
| Cooklang | Batch |
|---|---|
| step paragraph | a `step` (`instructionText` = text tokens re-joined; `order` = paragraph index; `= Sauce =` → `step.section`; inline `180 ºC` → `step.temperature`) |
| unique ingredient token | a `slot` (`name` from token; `resolution` = library match, or `sub_recipe` pin if it was a `@@`/`@./path` reference) |
| each inline occurrence | a `usage` (`{quantityValue, quantityUnit}` from `{q%unit}`, linked to slot + step) |
| `~timer`, `#cookware` | no first-class home today → fold into step text for now |

### Cooklang seeds (ranked)
1. **`.cook` as a `create` input + AI-import target** (adapter over cooklang-ts). *Highest
   leverage:* kills JSON-authoring friction AND de-risks AI import (model → `.cook` →
   cooklang-ts AST → `RecipeContent`; removes the "LLM emits malformed JSON" failure mode).
2. **`batch show/export --format cook`** exporter. We already have the normalized entities to
   *emit* `.cook`; gives a diffable, shareable artifact + ecosystem interop (Obsidian, CookCLI
   shopping lists). Low cost, complements the existing `export --format md`.
3. **`=` quantity-lock for scaling** (salt/leavening stay constant when scaled) — a small
   per-usage flag; proven idea worth lifting into the usage model.
4. **Optional `@?` ingredient + ranges `{2-4}`** — parser/UX niceties on import.

**Reject:** Cooklang as Batch's *storage* model (lossy for versions/macros/composition); its
`@@`/`@./path` textual sub-recipes (our pinned, macro-rolled composition is strictly stronger —
on import, resolve a `@@ref` to a `sub_recipe` pin, not a live include).

---

## Part B — Doneness diagrams & flowchart recipes (Benjamin the Baker)

**Verified.** "Benjamin the Baker" = **Benjamin Delwiche** (@benjaminthebaker), math teacher +
baking educator; book **_Dessert Course: Lessons in the Whys and Hows of Baking_** (DK, 2025).
His own description + an independent review confirm each book section uses the same template:
an opening image, **a flowchart showing the relationship between recipes**, full step-by-step
recipes, and a **"learning with" section explaining the effect of each recipe decision** —
including images of **how to tell if a bake is under-, over-, or just-right**. (Access limit:
the actual flowchart *images* and book interior aren't web-accessible; his website recipes are
plain linear steps — the apparatus lives in the printed book, verified via his caption + a
reviewer, not page inspection.)

**The concept, distilled** (corroborated across King Arthur, Serious Eats/Kenji, Niki Segnit's
*Lateral Cooking*):
- **Visual-state triad: under / right / over.** A doneness checkpoint isn't one target — it's a
  3-state comparison, each with sensory descriptors (cf. the universal steak chart).
- **Sensory cues over time/temperature.** Time/temp are unreliable proxies; read color, aroma,
  feel, sound (cake: *edges pull away 1/8–1/4"; springs back; shiny→matte; tester clean*).
  Internal temp is a *secondary* cross-check.
- **Branch points** — "if it looks like X, do Y"; the recipe forks on an *observed state*.
- **Failure mode → cause → fix** — a stable triple (flat cookies → {warm pan, dead leavener,
  too much sugar} → {chill dough, cool pans, fresh leavener}).
- **Derivation continuum** (Segnit) — recipes as neighbors "a tweak or two" apart. *= Batch's
  base→variant tree.*

**Why it matters for software.** A linear recipe answers "what's next." Doneness/branch
modeling answers what a string list can't: **mid-bake decision support** (the timer lied, the
cue didn't), **troubleshooting as data** (a bad result links to a fix *and back to the step
that caused it*), and **calibrate-done-to-YOUR-oven** (sensory targets are oven-independent;
repeated feedback personalizes them).

### Mapping onto Batch (a step is linear today: `{componentKey, order, instructionText, section?, temperature?}`)
- **(a) Doneness checkpoints on a step** — optional `checkpoints[]`, each
  `{ cue, states:{under,right,over}, sense?:(sight|smell|touch|sound|taste|temp), targetTemp? }`.
  Captures the triad with **zero branching**; `temperature` becomes the secondary cross-check.
- **(b) Branch/conditional steps** — `branch?: { on: checkpointRef, cases:[{when, goto}] }`,
  turning `steps[]` into a DAG. (Could reuse the sub-recipe **cycle-guard** we already have.)
- **(c) Failure modes** — `FailureMode { symptom, causes[], fixes[], relatesToStep?/checkpoint? }`.
  The `relatesTo` link is what makes it more than a FAQ.

**Interactions with what we already shipped (the high-value part):**
- **Feedback log ↔ checkpoints.** Let a tasting note optionally carry `checkpointRef`. Now
  "too dry" attaches to the doneness checkpoint it violated, and repeated notes ("always over
  by 3 min") become **per-oven calibration**. Leverages an asset already built.
- **Versioning ↔ doneness target.** A variant could differ *only* in its "right" state
  (gooey→set) — the diff *is* the doneness state, a first-class use of base→variant.
- **Composition ↔ flowchart.** The "bagels ↔ pretzels" sibling links *are* our derivation tree;
  no new structure needed to render that flowchart.

### Doneness seeds (ranked, smallest → largest)
1. **Optional `visualCue` string on a step** — captures "cues over times" instantly; one
   nullable field. *Do this first; pure upside.*
2. **Structured `checkpoints[]` (under/right/over + sense)** — the real concept; queryable; the
   anchor everything else hangs from.
3. **Feedback note → checkpoint ref** — converts the tasting log into per-oven calibration;
   cheap, leverages a shipped asset.
4. **`FailureMode {symptom→causes→fixes}` entity** — troubleshooting as data; mostly content.
5. **Step-level `branch?` (DAG)** — true conditionals. *Not yet — #1–#3 capture ~80% of the
   value at ~10% of the cost.*
6. **Full branching DAG + visual flowchart renderer** — *No (YAGNI)* until users author trees.

---

## Merged priority — if/when we graduate any of this

| Rank | Seed | Source | Why | Cost |
|---|---|---|---|---|
| 1 | `.cook` import/authoring adapter | Cooklang | Kills JSON friction + de-risks AI import (#3); validates our model | Medium (cooklang-ts adapter) |
| 2 | `visualCue` string on a step | Doneness | Captures the concept with no model surgery | Tiny |
| 3 | Feedback note → checkpoint ref | Doneness | Per-oven calibration from an asset we own | Small (needs #4) |
| 4 | `checkpoints[]` (under/right/over) | Doneness | The actual doneness concept, queryable | Medium |
| 5 | `--format cook` exporter | Cooklang | Diffable/shareable + ecosystem interop | Low |
| 6 | `=` quantity-lock for scaling | Cooklang | Correct scaling for salt/leavening | Small |
| — | Branching DAG steps; `.cook` as storage; `@@` textual sub-recipes | both | Rejected / YAGNI | — |

## Recommendation on sequencing
- **Cooklang `.cook` import (seed 1) is the natural front half of AI import (#3)** — don't build
  it standalone; fold it in when we reach that milestone. It directly attacks the friction the
  user has actually felt.
- **Doneness (seeds 1→4) is a net-new product direction** the user is actively *designing*.
  Worth its own brainstorm→spec→plan when we choose to expand scope — not a drive-by add.
- **The roadmap's next step is unchanged:** the M4 real-recipe dogfood (champion Crumbl base via
  compare→promote→rebase). These notes are banked for when we pivot to #3 or to doneness.

## Sources
- Cooklang: cooklang.org/docs, /docs/spec, blog/37 (design rationale, nutrition out-of-scope),
  blog/44 (parser integration), cooklang-rs `extensions.md`, github.com/cooklang/{spec,cookcli}.
- Doneness: instagram.com/benjaminthebaker; *Dessert Course* (DK 2025);
  cookbookreview.blog review (2025-06-19); King Arthur "how to tell when cake/bread is done";
  Sally's Baking Addiction cookie-spread troubleshooting; Niki Segnit *Lateral Cooking*.
