# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One primary user: the builder-baker who owns the recipe store. Three scenes weigh about equally:

- **Desk, planning** — laptop; browsing the recipe tree, comparing variants and bake-off arms, deciding what to bake next.
- **Kitchen, phone** — phone propped on the counter mid-bake, reading a bake card one step at a time.
- **Showing others** — portfolio / interview demo where the version graph and the craft are the point.

## Product Purpose

Batch is "git for recipes": every recipe is an immutable version in a DAG (bases → variants → sub-recipes), with macros computed to the cent from a shared ingredient library. The web viewer is the read-only window over that store: the tree, a full bake card per recipe, a filterable index, a ranked cooking queue, and a mix-ins pantry guide. Success = the user can find, compare, and cook from a recipe faster than from the CLI, and the graph is legible enough to explain the project to someone in a minute.

## Positioning

Recipes as versioned, composable objects. Variants inherit from a base by component-level overrides; sub-recipes compose; bake-offs run arms side by side; promote/rebase graft winning components across the tree. Macros (kcal, protein, cal/g-protein ratio) are derived, never typed. No recipe app treats lineage and composition as first-class.

## Operating Context

- Domain: lean high-protein baking. The north-star metric is **cal / g protein** (lower is leaner; a warning past 18).
- The store lives in a private data repo; the site is statically built from a baked `db.json` snapshot — no runtime data access, no writes yet (a `RecipeSource` seam reserves them).
- Vocabulary: base, variant, sub-recipe, bake-off, arm, root, to-make, tried, verdict (excellent / good / okay / bad), lean, mix-in, macro basis (complete / partial).
- Recipes list at ~92; ingredients at ~98. Bake cards carry ingredients grouped by section (cook unit + grams), a numbered method with inline ingredient chips, and cooking notes (pitfall / technique / note).

## Capabilities and Constraints

- Routes: `/` tree (pannable, zoomable DAG; click → in-place modal bake card; searchable "All recipes" drawer; togglable legend; undo/redo nav; WASD/arrow/+/- keyboard nav), `/r/[id]` full bake card, `/recipes` index (search by name/family/tag), `/queue` (make-next ranked by perishables then leanness; make-again), `/mixins` guide.
- Stack: Next.js 14 app router, React 18, vanilla CSS with tokens, dagre layout. No component library. Fonts via `next/font/google`.
- Tests exist for view-models and components (vitest + testing-library); CI typechecks. Keep them green.
- Every flow, datum, keyboard shortcut, and accessibility affordance (focus trap, inert drawer, reduced-motion) must survive the redesign.
- Must work at phone width (~400px) with no horizontal scroll; canvas overlays must not cover controls.

## Brand Commitments

- Name: **Batch**. Everything else — mark, palette, type — is open to replacement (confirmed 2026-09-14).

## Evidence on Hand

- Real recipe data (92 recipes, 98 ingredients, tasting log, cooking notes) baked into `data/db.json`.
- Screenshots of the incumbent UI at `/private/tmp/…/scratchpad/before-*.png` (evidence and anti-reference only).
- No photography of the bakes exists in the repo; do not fabricate imagery of food.

## Product Principles

1. Lineage is the product: the graph must read at a glance — what derives from what, what composes what.
2. Numbers are the truth: macros and the ratio are first-class, never decorative.
3. Cookable: a bake card must work on a phone with floury hands — big steps, clear quantities.
4. Plain framing: a base is a base; no fake hierarchy, no invented lineage.
5. Dense but calm: the operator scans dozens of recipes; hierarchy over ornament.
