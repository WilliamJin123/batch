---
version: 1
slug: "packages-web"
primary_target: "packages/web"
related_targets: ["packages/web/app","packages/web/components","packages/web/styles"]
---

# Surface brief: packages/web (whole viewer)

Scope: replacement visual world for the Batch web viewer — all routes (`/`, `/r/[id]`, `/recipes`, `/queue`, `/mixins`). Mode: **Operate**.

Audience: the builder-baker, three scenes weighted evenly (desk planning, kitchen phone, showing others). Job: find, compare, cook from a recipe; explain the DAG in a minute. Task: open a recipe from the tree or index, read its formula, pick what to make next. Proof/content: real data only (92 recipes, 98 ingredients, notes, tasting log); no food imagery. Constraints: every flow, datum, shortcut, and a11y affordance survives; phone ~400px with no horizontal scroll; canvas overlays never cover controls; tests + typecheck stay green.

## Direction contract

THESIS: Every recipe is a production formula — quantities, ratios, and macros on one ruled grid you can run a shift from. It refuses the recipe-app default (cream ground, serif titles, rounded cards, soft shadows) and the chart-poster default (heavy black rules, kicker labels).

OWN-WORLD: White bond paper (#FFFFFF), near-black ink (#1A1A1A), ledger rules in one grey (#C9C9C4) at 1px, and highlighter yellow (#FFE84D) as the one committed field — it marks what is selected, what is next, and the lean line. Everything numeric sits in tabular numerals aligned right, in a single grotesk with a condensed cut for header rows. Rows, not cards: containers are rules above and below, never boxes with radius and shadow. Marks are drawn: an open square = to-make, a filled square = tried, a double-ruled square = excellent, a highlighter dash over the ratio when it crosses 18. Sub-recipes are marginal call-outs set smaller with a bracket rule. Selection = a full-width highlighter band.

STORY: The visitor reads the sheet as a foreman reads a schedule: what is in production, what it derives from, what it costs per gram of protein, what to run next. They believe the numbers because they look computed, not styled. They open a row, read the formula, and go bake it.

FIRST VIEWPORT (desktop 1440): A 44px rail — "Batch" set condensed-bold left, then four plain text links (Tree · Recipes · Queue · Mix-ins) with the active one underlined by a 2px ink rule; right edge shows the branch as a small ruled cell "main". Below, the full-bleed sheet: a faint horizontal ledger grid (every 28px). The DAG stays a DAG: nodes are ledger plates — a header row (name, condensed bold) over a 3-column ledger line (kcal · g protein · cal/g), rules top and bottom, no radius, arms lettered A/B in a ruled cell; bases carry a heavier top rule; sub-recipes are narrower call-outs with a bracket. Edges are 1px ink; the hovered lineage draws in 2px and the rest stays. Corner controls (top-left Recipes, top-right undo/redo/±/Fit/Legend) are ruled cells, not pills. Primary action: click a plate → the bake card as a formula sheet. Signature interaction: opening a recipe runs a highlighter stroke across the plate's header row (one authored moment, 240ms, ease-out), and the card's ratio cell inherits that band.

FORM: Formula Sheet — bakery production formula sheet, position #1 on my grounded list (Impeccable's pick over the assigned Technique Plate). Seed key 70a9e926. Build path: code-led.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: none — phone-width tree keeps the canvas with corner cells pinned to safe areas; the drawer is a full-height sheet page-over, never a partial overlay.
