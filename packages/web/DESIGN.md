---
name: Batch
description: A bakery production formula sheet for a recipe DAG — white bond, ink rules, one highlighter.
colors:
  paper: "#FFFFFF"
  ink: "#1A1A1A"
  ink-2: "#4A4A48"
  ink-3: "#6B6B68"
  rule: "#C9C9C4"
  rule-soft: "#E6E6E2"
  highlighter: "#FFE84D"
  highlighter-soft: "#FFF6B8"
  scrim: "rgba(26,26,26,.5)"
typography:
  display:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 82"
  headline:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 82"
  title:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.15
    fontVariation: "'wdth' 82"
  body:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums lining-nums"
  label:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  none: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "28px"
  xl: "48px"
  row: "28px"
  rail: "44px"
components:
  cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1px 6px"
  cell-hi:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1px 6px"
  control:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "30px"
    padding: "0 10px"
  control-on:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "30px"
    padding: "0 10px"
  search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 30px 6px 9px"
  ledger-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "5px 0"
  ledger-row-hi:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "5px 0"
  plate:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    width: "200px"
    padding: "0"
---

# Design System: Batch

## Overview

**Creative North Star: "The Formula Sheet"**

Batch is a production formula sheet, not a recipe app. Every recipe reads the way a foreman reads a schedule: what is in production, what it derives from, what it costs per gram of protein, what to run next. The sheet is white bond paper ruled in one grey, written in one grotesk, and marked with one highlighter. Numbers look computed because they are set in tabular numerals and aligned right; nothing is styled to look appetizing. Density is high and uniform — a 28px ledger row is the rhythm of the whole product, from the canvas grid behind the recipe tree to the rows of the index and queue.

The system rejects the recipe-app default (cream ground, serif titles, rounded cards, soft shadows) and the chart-poster default (heavy black rules, kicker labels). Depth does not exist: there is no light source, so there are no shadows, no glows, no glass. Containers are rules above and below, never boxes with radius. State is drawn, never coloured: an open square is to-make, a filled square is tried, a double-ruled square is excellent, a struck square needs work; a triangle warns, a diamond is a technique. The one moment of authored motion is a highlighter stroke that runs across the header of the recipe you just opened.

**Key Characteristics:**
- White paper, near-black ink, one grey rule, one highlighter yellow — nothing else.
- Rows, not cards. Rules above and below; zero radius everywhere.
- Tabular, right-aligned numerals; units in muted ink beside them.
- One grotesk (Archivo) with a condensed cut (`wdth` 82) for every heading and header row.
- Marks and icons are authored SVG in one stroke weight; no glyphs, no emoji, no colour semantics.
- Highlighter yellow means exactly three things: selected, next, over the lean line.

## Colors

A three-value palette — paper, ink, rule — with a single committed highlighter.

### Primary
- **Highlighter** (`#FFE84D`): the only chromatic value. It fills the picked recipe's header row on the tree, the picked row in the drawer, the top row of each Make-next column, the ratio row on the bake card, the per-serving composition row, an active control cell, and the `lean` chip on Mix-ins. It is a fill, never a text colour and never a border alone.
- **Highlighter, soft** (`#FFF6B8`): reserved for `::selection`; never used as a surface.

### Neutral
- **Paper** (`#FFFFFF`): every surface — page, plates, drawer, modal panel, popovers. There is no second surface tone.
- **Ink** (`#1A1A1A`): body text, headings, the top rule of a section, hovered edges, focus rings, the 1px ink border of any panel that floats over the canvas.
- **Ink 2** (`#4A4A48`): secondary text — descriptions, ledger keys, note text, muted meta.
- **Ink 3** (`#6B6B68`): units (`kcal`, `g`, `cal/g`), placeholders, hint text, the composition edge and its diamond, the sub-recipe bracket.
- **Rule** (`#C9C9C4`): the standard 1px rule between rows, around cells and controls, under section sub-heads.
- **Rule, soft** (`#E6E6E2`): the ledger grid behind the canvas (every 28px), inner cell dividers on a plate, row rules inside a plate.
- **Scrim** (`rgba(26,26,26,.5)`): behind the recipe modal and the shortcuts panel.

### Named Rules
**The One Highlighter Rule.** Yellow appears only as a full-cell or full-row fill on ≤1 element per region — the thing that is picked, next, or over the lean line. If a screen needs a second accent, the design is wrong, not the palette.

**The No-Colour-State Rule.** Recipe state (to-make, made, excellent, needs work) and note kind (pitfall, technique, note) are drawn marks in ink. No green, no red, no gold.

## Typography

**Display Font:** Archivo variable, `wdth` axis, self-hosted via `next/font` (with Helvetica Neue, Arial)
**Body Font:** Archivo (same family; the whole sheet is one voice)
**Label/Mono Font:** none — measurement is carried by tabular numerals in Archivo, not by a monospace costume

**Character:** A plain American grotesk that condenses to 82% for every heading and header row, so titles read as stamped labels on a form while running text stays open. Nothing italic, nothing tracked out, nothing uppercase.

### Hierarchy
- **Display** (800, 40px, 1, −0.01em, condensed 82%): the bake card title; 32px on phones.
- **Headline** (800, 32px, 1, −0.01em, condensed 82%): page titles — Recipes, Cooking queue, Mix-ins; 26px on phones.
- **Title** (700, 15px, 1.15, condensed 82%): a plate's recipe name on the tree; 13.5px/600 for sub-recipes. Section heads on the card are 14px/700 condensed over a 1px ink rule; queue lane titles 16px/700 condensed; the brand mark is 78%.
- **Body** (400, 14px, 1.5): everything else. Running prose (descriptions, method steps) is 14.5px/1.6 capped at 68ch; plate detail lines are 11.5–12px.
- **Label** (600, 11px, 1.5): ruled cells — tags, `base`, `sub-recipe`, arm letters, `lean`, `tune`, `no-bake`. Never uppercase, never letter-spaced.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums lining-nums` is set on `body` and never overridden. Every numeric column is right-aligned; units sit in Ink 3 after the number.

**The Condensed Header Rule.** Headings and header rows condense (`font-stretch: 82%`); running text and numerals never do.

## Layout

A single centred page column of 1280px with 32px side gutters (16px at ≤640px) sits under a fixed 44px rail. The recipe tree is the exception: it is a full-bleed canvas fixed below the rail, with a faint horizontal ledger grid every 28px and corner clusters of ruled control cells (top-left Recipes, top-right undo/redo, ± zoom, Fit, Legend) that never leave their corners.

The vertical rhythm is the 28px ledger row: index rows, queue rows, drawer rows, and canvas grid lines all sit on it; the bake card's ledger table uses 5px cell padding on rule-soft lines, and sections open with a 14px condensed head over a 1px ink rule and a 28px gap above.

Two-column surfaces: the bake card is `344px | 1fr` (ingredients + composition + tasting log on the left rail, method on the right) with a 48px gutter; the hero is `1fr | 300px` with the macro ledger on the right. The queue is two equal lanes (bake / no-bake) with 24px between; Mix-ins flows its five categories through two CSS columns. All of these collapse to one column at ≤880px (card), ≤680px (queue), ≤720px (mix-ins, index). Index columns beyond name · cal · cal/g · state are hidden at ≤720px. Nothing scrolls horizontally at 390px; tables and the canvas own their overflow.

Breakpoints in use: 520, 640, 680, 720, 760, 880px.

## Elevation & Depth

None. The sheet has no light source: no `box-shadow`, no blur, no gradients, no glass. Layering is done with a 1px ink border on the floating element (drawer, legend, shortcuts panel, hover pop, modal panel) and, for modal surfaces, a 50% ink scrim behind it. Hover and focus are answered by border colour moving from Rule to Ink, never by lift.

### Named Rules
**The Flat Sheet Rule.** Depth is a rule, never a shadow. A floating panel earns a 1px ink border and nothing else.

## Shapes

Zero radius, everywhere, including inputs, buttons, chips, popovers, and the modal panel. Containers are horizontal rules (1px Rule between rows, 1px Ink at the top of a section or table head, 1px rule-soft inside a plate). The only vertical structure is the bracket: a 2px Ink 3 left rule on sub-recipe plates, and a 1px rule (Ink for notes, Rule for plate feedback) on inline callouts. Nothing else carries a coloured side stripe.

Marks are square-derived: open, filled, double-ruled, and struck 10px squares for recipe state; a triangle, diamond, and small filled square for note kinds. Icons are 16-grid SVG at 1.5px stroke with square caps.

## Components

### Buttons (control cells)
- **Shape:** square-cornered ruled cell, 30px tall (`0 10px`), 12.5px/500, 1px Rule border on paper.
- **Hover / Focus:** border to Ink; focus-visible is a 2px Ink outline offset 2px (global).
- **Active:** Highlighter fill with an Ink border (`Recipes` when the drawer is open, `Legend` when shown).
- **Grouped:** adjacent cells overlap borders by 1px (undo|redo, +|−); icon-only cells are 30px square. Disabled is 55% opacity, no colour change.

### Chips (cells)
- **Style:** 11px/600 text in Ink 2, 1px Rule border, `1px 6px`, on paper; `lean` and other "on" cells fill with Highlighter and Ink text.
- **State:** structural (`base`, `sub-recipe`, arm `A`/`B`) cells use an Ink border; descriptive tags stay Rule.

### Cards / Containers (plates and rows)
- **Corner Style:** none.
- **Background:** paper.
- **Shadow Strategy:** none (see Elevation).
- **Border:** rows carry a 1px Rule below and a 1px Ink rule at the head of the list. A tree plate is 200px wide with a 1px Rule box, a 1px Ink top rule (2px for a base, 3px double for an excellent bake, dashed sides for to-make), and a 184px width plus 2px Ink 3 left bracket for a sub-recipe.
- **Internal Padding:** plate header `7px 10px 6px`; ledger cells `5px 6px`; page rows `5–8px 0`.

### Inputs / Fields
- **Style:** 1px Rule border, paper, 13.5px, `6px 30px 6px 9px`, no radius, native search chrome removed; a 24px SVG clear control sits inside at the right.
- **Focus:** border to Ink, no outline, no glow.

### Navigation
- **Style:** a fixed 44px rail with a 1px Rule underline: the SVG mark plus "Batch" (condensed 78%, 800) left; four plain 14px text links; the active link carries a 2px Ink underline; the branch name sits in a ruled cell at the right edge.
- **Mobile:** same rail, no menu — four links fit at 390px.

### Ledger table (signature)
The bake card's macro table and every numeric row share one grammar: key in Ink 2 on the left, value in tabular Ink on the right, unit in Ink 3 after the value, 1px rule-soft between rows, 1px Ink under the head. The ratio row (cal per gram protein) is a Highlighter band; a 3px Highlighter dash after any ratio over 18 is the lean-line warning.

### Plate (signature)
A tree node: condensed 15px name over a three-cell ledger line (`cal · g P · cal/g`), a makes line, a drawn state mark with its label, and an optional feedback callout. Opening a recipe runs a Highlighter stroke across the header row — `scaleX(0→1)` from the left, 240ms ease-out, once — and the card's ratio row inherits the same band. This is the system's only authored motion beyond 120–200ms border and transform transitions; `prefers-reduced-motion` removes all of it.

## Do's and Don'ts

### Do:
- **Do** set every number in tabular numerals, right-aligned, with the unit in Ink 3 after it.
- **Do** build lists as ruled rows: 1px Ink at the head, 1px Rule between rows, 28px rhythm.
- **Do** condense (`font-stretch: 82%`) headings and header rows only.
- **Do** use Highlighter as a full-row or full-cell fill for exactly one meaning per region: selected, next, or over the lean line.
- **Do** draw state and note marks as ink SVG squares/triangles/diamonds from `Mark`, and icons from `Icon` at 1.5px square-capped stroke.
- **Do** float panels with a 1px Ink border on paper and a 50% Ink scrim when modal.

### Don't:
- **Don't** add a second accent colour, or use colour to encode state.
- **Don't** round a corner, cast a shadow, blur, or gradient anything.
- **Don't** box content into cards; a rule above and below is the container.
- **Don't** put a kicker or eyebrow above a heading, or set labels in uppercase/tracked type.
- **Don't** use monospace, unicode glyphs, or emoji for icons or "technical" flavour.
- **Don't** let a canvas overlay half-cover the corner controls; on phones the drawer is a full-width sheet.
