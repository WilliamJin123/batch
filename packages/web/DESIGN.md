---
name: Batch
description: A matcha sticker sheet for a recipe DAG — cream-green paper, moss ink, one matcha highlighter, round sticker nodes.
colors:
  paper: "#F6FAF2"
  paper-2: "#E8F2DF"
  ink: "#2F4A2A"
  ink-2: "#4A6645"
  ink-3: "#5E7A58"
  rule: "#C9DFBD"
  rule-soft: "#DFECD6"
  hi: "#6CC48A"
  hi-soft: "#D6F0DE"
  hi-ink: "#17321C"
  hi-text: "#27804A"
  warn: "#D9534F"
  scrim: "rgba(47,74,42,.38)"
typography:
  display:
    fontFamily: "'Baloo 2', Nunito, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0"
  headline:
    fontFamily: "'Baloo 2', Nunito, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0"
  section:
    fontFamily: "'Baloo 2', Nunito, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "'Baloo 2', Nunito, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Nunito, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums lining-nums"
  label:
    fontFamily: "Nunito, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "14px"
  pill: "999px"
shadows:
  soft: "0 10px 28px rgba(47,74,42,.16), 0 1px 2px rgba(47,74,42,.08)"
  hard: "3px 3px 0 #2F4A2A"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "28px"
  xl: "48px"
  rail: "44px"
components:
  cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  cell-hi:
    backgroundColor: "{colors.hi}"
    textColor: "{colors.hi-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  control:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 12px"
  control-on:
    backgroundColor: "{colors.hi}"
    textColor: "{colors.hi-ink}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 12px"
  search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 32px 6px 13px"
  ledger-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "5px 0"
  ledger-row-hi:
    backgroundColor: "{colors.hi}"
    textColor: "{colors.hi-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  sticker:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    shadow: "{shadows.hard}"
    width: "200px"
    padding: "0"
  floating:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    shadow: "{shadows.soft}"
---

# Design System: Batch

## Overview

**Creative North Star: "The Matcha Sticker Sheet"**

Batch is a recipe DAG you can read like a schedule — what is in production, what it derives from, what it costs per gram of protein, what to run next — drawn as a sheet of stickers on cream-green paper. The paper is a soft matcha cream ruled in pale green, the ink is moss, the one accent is a matcha green used as a highlighter fill and as the colour of every title. Numbers still look computed: Nunito's tabular numerals, right-aligned, units muted beside them. Tree nodes are stickers — a 2px ink outline, 14px corners, a hard 3px offset shadow — so the graph reads as a peeled-and-placed sticker sheet rather than a diagram. Floating surfaces (modal, drawer, popovers, legend) lift with one soft shadow instead. Everything else is a rounded row.

The system keeps the formula-sheet principles — density, ledgers, tabular figures, drawn state marks, one accent with a small vocabulary of meanings — and swaps the scholarly voice for a cute one: Baloo 2 for titles, pill chips, stars for state. Depth exists but is stylised: stickers cast a hard flat shadow, panels cast a soft one, nothing glows or gradients. State is still drawn: an open star is to-make, a filled star is made, a ringed star is excellent, a struck star needs work; a triangle warns, a diamond is a technique. The one authored motion is the matcha stroke that runs across the header of the sticker you just opened.

**Key Characteristics:**
- Matcha cream paper, moss ink, pale green rules, one matcha highlighter, one warm warn red — nothing else.
- Rounded rows and pill chips; 14px corners on panels and stickers, 8px on highlighted rows.
- Tabular, right-aligned numerals; units in Ink 3 beside them.
- Baloo 2 (700/800) for every title, header row and section head, in the accent green; Nunito for everything else.
- Marks are ink SVG stars (state) and triangle/diamond/square (note kinds); icons are 16-grid SVG at 1.5px stroke.
- Matcha green means exactly four things: a title, selected, next, over the lean line (the lean line dash is the warn red).

## Colors

A green-on-cream palette with one committed accent and one warm warning.

### Primary
- **Hi** (`#6CC48A`): the highlighter. Fills the picked sticker's header row on the tree, the picked row in the drawer, the top row of each Make-next column, the ratio row on the bake card, an active control pill, the `base` role cell, the bake-off pill, and the `lean` chip on Mix-ins. Text on it is always Hi-ink.
- **Hi, soft** (`#D6F0DE`): the tint — a base sticker's fill, the per-serving composition row, the active nav pill, the step numerals, the temperature chips, `::selection`, and the 3px ring around the picked sticker.
- **Hi, ink** (`#17321C`): text on a Hi or Hi-soft fill.
- **Hi, text** (`#27804A`): the accent as type — every page title, section head, lane title, the brand, hovered edges. AA on paper at 14px+.

### Neutral
- **Paper** (`#F6FAF2`): the page, stickers, inputs, popovers.
- **Paper 2** (`#E8F2DF`): the second surface — the hero macro card, the watch-outs card, the modal's top bar, row hover.
- **Ink** (`#2F4A2A`): body text, sticker outlines and shadows, the derive edge, focus rings.
- **Ink 2** (`#4A6645`): secondary text — descriptions, ledger keys, note text, muted meta.
- **Ink 3** (`#5E7A58`): units, placeholders, hint text, the composition edge and its diamond, sub-recipe outlines.
- **Rule** (`#C9DFBD`): the standard rule between rows, chip and control borders, section-head rules, the canvas dot grid.
- **Rule, soft** (`#DFECD6`): row rules inside lists and stickers.
- **Warn** (`#D9534F`): the lean-line dash, the `tune` chip, a bad-feedback bracket. Never a fill.
- **Scrim** (`rgba(47,74,42,.38)`): behind the recipe modal and the shortcuts panel.

### Named Rules
**The One Highlighter Rule.** Hi appears as a full-cell or full-row fill on ≤1 element per region — the thing that is picked, next, or active. Hi-text is reserved for titles and hovered edges. If a screen needs a second accent, the design is wrong, not the palette.

**The Drawn-State Rule.** Recipe state and note kind are ink marks. Colour never encodes state; Warn only flags a figure or a chip.

## Typography

**Display Font:** Baloo 2 (700, 800), self-hosted via `next/font` (falls back to Nunito, Helvetica Neue, Arial)
**Body Font:** Nunito (variable), self-hosted via `next/font`
**Label/Mono Font:** none — measurement is carried by Nunito's tabular numerals

**Character:** Baloo 2 is round and chubby; it carries every title in the accent green so headings read as sticker labels. Nunito is the same roundness at reading size, with lining tabular numerals for the ledgers. Nothing italic, nothing tracked out, nothing uppercase.

### Hierarchy
- **Display** (Baloo 2 800, 40px, 1.05): the bake card title; 32px on phones.
- **Headline** (Baloo 2 800, 34px, 1): page titles — Recipes, Cooking queue, Mix-ins; 28px on phones.
- **Section** (Baloo 2 700, 16px): card section heads over a 1.5px Rule; queue lane titles 18px; the hero ledger heads 14px; method sub-heads 14.5px.
- **Title** (Baloo 2 700, 15px, 1.15): a sticker's recipe name; 13.5px for sub-recipes. The brand is 20px/800.
- **Body** (Nunito 400, 14px, 1.5): everything else. Running prose is 14.5px/1.6 capped at 68ch; sticker detail lines are 11.5–12px; figures on a sticker are 600.
- **Label** (Nunito 700, 11px): pill chips — tags, `base`, `sub-recipe`, arm letters, `lean`, `tune`, `no-bake`. Never uppercase, never letter-spaced.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums lining-nums` is set on `body` and never overridden. Every numeric column is right-aligned; units sit in Ink 3 after the number.

**The Two-Face Rule.** Baloo 2 is only ever a title, header row, or section head, and only ever in Hi-text or Ink. Running text, chips and numerals are Nunito.

## Layout

A single centred page column of 1280px with 32px side gutters (16px at ≤640px) sits under a fixed 44px rail. The recipe tree is the exception: a full-bleed canvas fixed below the rail, with a faint polka-dot grid (1.1px Rule dots on an 18px tile) and corner clusters of pill controls (top-left Recipes, top-right undo/redo, ± zoom, Fit, Legend) that never leave their corners.

Rows are the rhythm: index rows, queue rows and drawer rows are 30px-ish rounded rows with a soft rule beneath; the bake card's ledger table uses 5px cell padding; sections open with a 16px Baloo head over a 1.5px Rule and a 28px gap above.

Two-column surfaces: the bake card is `344px | 1fr` (ingredients + composition + tasting log on the left rail, method on the right) with a 48px gutter; the hero is `1fr | 300px` with the macro card on the right. The queue is two equal lanes (bake / no-bake) with 24px between; Mix-ins flows its categories through two CSS columns. All of these collapse to one column at ≤880px (card), ≤680px (queue), ≤720px (mix-ins, index). Nothing scrolls horizontally at 390px; tables and the canvas own their overflow.

Breakpoints in use: 520, 640, 680, 720, 760, 880px.

## Elevation & Depth

Two shadows, each with one job. **Hard** (`3px 3px 0 Ink`) is the sticker offset: tree nodes and the bake-off pill (2px) cast it; hover lifts a node 1px and grows it to 4px. **Soft** (`0 10px 28px rgba(ink,.16)`) lifts anything floating over the page: the modal panel, the drawer, the legend, the hover pop, the bake-off note, the shortcuts panel. Sub-recipe stickers and page rows cast nothing. No blur behind, no gradients, no glass.

### Named Rules
**The Sticker Rule.** A hard shadow means "a sticker on the sheet" (a recipe). A soft shadow means "floating over the sheet" (a panel). Nothing else casts one.

## Shapes

Round everywhere. Panels, stickers and cards are 14px; highlighted rows and hover rows are 8px; chips, controls, inputs and the nav pills are full pills. Grouped controls (undo|redo, +|−|Fit) are one pill strip: only the ends are rounded, cells overlap borders by 1.5px.

Stickers are outlined 2px Ink; a base is filled Hi-soft; a to-make is dashed; a sub-recipe is 184px wide, 1.5px Ink 3, no shadow. Brackets are the only vertical structure: a 2px Rule left rule on sticker feedback (Warn when bad) and a 2px Hi left rule on inline step notes.

Marks: 10px five-point stars for recipe state (open, filled, ringed, struck); a triangle, diamond and small rounded square for note kinds. Icons are 16-grid SVG at 1.5px stroke.

## Components

### Buttons (control pills)
- **Shape:** pill, 32px tall (`0 12px`), 12.5px/700, 1.5px Rule border on paper.
- **Hover / Focus:** border to Ink; focus-visible is a 2px Ink outline offset 2px (global, rounded).
- **Active:** Hi fill, Hi border, Hi-ink text (`Recipes` when the drawer is open, `Legend` when shown).
- **Grouped:** a pill strip (ends rounded, inner cells square); icon-only cells are 32px. Disabled is 55% opacity, no colour change.

### Chips (cells)
- **Style:** 11px/700 Nunito in Ink 2, 1px Rule border, pill, `1px 8px`, on paper; "on" cells (`lean`, a base's role) fill Hi with Hi-ink text; `tune` is a Warn outline.
- **State:** structural cells (arm `A`/`B`) use an Ink border; descriptive tags stay Rule.

### Cards / Containers
- **Corner Style:** 14px (panels, stickers, the hero macro card, watch-outs); 8px (highlighted rows).
- **Background:** paper; Paper 2 for the hero macro card, watch-outs, and the modal top bar.
- **Shadow Strategy:** hard on stickers, soft on floating panels, none on page cards (see Elevation).
- **Border:** rows carry a 1px Rule-soft below and a 1.5px Rule at the head of the list. A sticker is 200px wide, 2px Ink, 14px corners, hard shadow; base filled Hi-soft; to-make dashed; sub-recipe 184px, 1.5px Ink 3, no shadow.
- **Internal Padding:** sticker header `8px 11px 7px`; ledger cells `5px 7px`; page rows `5–8px 8px`.

### Inputs / Fields
- **Style:** pill, 1.5px Rule border, paper, 13.5px, `6px 32px 6px 13px`, native search chrome removed; a round 24px clear control sits inside at the right.
- **Focus:** border to Hi with a 3px Hi-soft ring, no outline.

### Navigation
- **Style:** a fixed 44px rail with a 1.5px Rule underline: the rounded SVG mark plus "Batch" (Baloo 2 20px/800, Hi-text) left; four 13.5px/600 pill links, the active one filled Hi-soft with Hi-ink text; the branch name in a pill with a Hi dot at the right edge.
- **Mobile:** same rail, no menu — four pills fit at 390px.

### Ledger table (signature)
The bake card's macro card and every numeric row share one grammar: key in Ink 2 on the left, value in tabular Ink on the right, unit in Ink 3 after the value, a Rule between rows, a 1.5px Ink 3 rule under each head. The ratio row (cal per gram protein) is a Hi band with 8px corners; a 3px Warn dash after any ratio over 18 is the lean-line warning.

### Sticker (signature)
A tree node: Baloo 15px name over a three-cell ledger line (`cal · g P · cal/g`), a makes line, a star mark with its label, and an optional feedback callout. Opening a recipe runs a Hi stroke across the header row — `scaleX(0→1)` from the left, 240ms ease-out, once — and puts a 3px Hi-soft ring around the sticker; the card's ratio row inherits the same band. This is the system's only authored motion beyond 120–300ms border, shadow and transform transitions; `prefers-reduced-motion` removes all of it.

## Do's and Don'ts

### Do:
- **Do** set every number in tabular numerals, right-aligned, with the unit in Ink 3 after it.
- **Do** build lists as rounded rows: 1.5px Rule at the head, Rule-soft between rows.
- **Do** set titles, header rows and section heads in Baloo 2 in Hi-text; nothing else in Baloo.
- **Do** use Hi as a full-row or full-cell fill for exactly one meaning per region: selected, next, or active.
- **Do** draw state marks as ink stars and note marks as triangle/diamond/square from `Mark`; icons from `Icon` at 1.5px stroke.
- **Do** give a sticker a hard shadow and a floating panel a soft one — and nothing else a shadow.

### Don't:
- **Don't** add a second accent colour, or use colour to encode recipe state.
- **Don't** square a corner; the smallest radius on the sheet is 8px.
- **Don't** blur, gradient, or glass anything; depth is one flat hard shadow or one soft one.
- **Don't** put a kicker or eyebrow above a heading, or set labels in uppercase/tracked type.
- **Don't** use monospace, unicode glyphs, or emoji for icons or "technical" flavour.
- **Don't** let a canvas overlay half-cover the corner controls; on phones the drawer is a full-width sheet.
