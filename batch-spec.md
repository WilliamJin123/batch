# Batch — Project Spec

> A recipe engineering platform for building, versioning, and optimizing recipes through AI-assisted iteration. Originally motivated by the pursuit of optimal low-cal, high-protein, good-texture dessert recipes.

---

## Core Concept

Batch treats recipes as **versioned, forkable objects** — Git for recipes, with an AI agent as a collaborator. Recipes aren't static documents; they're living trees of variants, each one an experiment tracked with macros, notes, and lineage.

The two key metaphors:
- **Git**: base recipe = root commit, variants = branches, modifications = diffs, the agent = a collaborator who opens PRs
- **Hypothesis testing**: each variant is an experiment ("does cottage cheese hold texture in this?"), rated and logged, building generalizable knowledge over time

---

## Architecture Overview

### Two Separate Axes

1. **Composition** — a recipe *contains* other recipes. Tiramisu has a "ladyfingers" slot; that slot can resolve to store-bought (a leaf ingredient with macros) or a homemade ladyfinger recipe (a full sub-recipe with its own steps and variants). This makes the overall structure a **DAG** (directed acyclic graph).

2. **Versioning** — a recipe *varies*. Chocolate tiramisu vs. matcha tiramisu are branches off the same base. Each node in the DAG can have its own version tree.

### The Slot/Interface Model

An ingredient slot is an **interface**: it defines a requirement (e.g. "ladyfingers, 24ct") that can be satisfied by different **implementations**:
- A raw/store-bought ingredient (leaf node with label macros)
- A sub-recipe (full recipe with its own steps, ingredients, and variants)

Swapping implementations is a one-tap operation. The macro engine recurses: if a slot resolves to a sub-recipe, compute its macros per-unit and roll them up into the parent.

### Ingredients Tied to Steps

Ingredients are NOT a flat shopping list separate from instructions. Steps are first-class objects, and each step references **ingredient usages** inline:

- A step isn't "mix the wet ingredients"
- A step is "whisk {mascarpone, 250g} with {protein powder, 60g} until smooth"

Each usage references a slot + quantity + prep state (e.g. "softened", "melted"). This means:
- Diffs show which *steps* change when you swap an ingredient, not just the shopping list
- The agent can reason about technique ("Greek yogurt is wetter, so step 4 needs gelatin")
- Cooking mode shows exactly the amounts needed *at that step*, scaled to serving count

### Immutable Versions

Versions never edit in place. Every change creates a new version row pointing at its parent. This makes:
- Diffs trivial (compare two rows)
- History free (it's just the version chain)
- Undo a non-feature (just go back to parent)
- Macro snapshots reliable (computed macros are snapshotted per version, so changing an ingredient's data doesn't retroactively alter old versions)

---

## Data Model (Conceptual)

These are the core entities. Schema details are left to implementation.

### recipes
The top-level identity of a recipe. Has a name, description, tags, created_by, timestamps. A recipe is a container for versions.

### recipe_versions
A specific snapshot of a recipe. Points to a parent_version (nullable for the root). Records: author (user or agent), commit_message, status (draft/approved/rejected), computed_macros (snapshotted), notes/ratings, timestamps.

### steps
Ordered instructions belonging to a recipe_version. Each step has: order, instruction_text, section (optional, e.g. "Dough", "Filling", "Assembly"), timer_seconds (optional).

### ingredient_slots
A named requirement within a recipe_version. Has: name, quantity, unit, prep_state (e.g. "melted"), and a resolution — either a reference to a raw ingredient OR a reference to another recipe (sub-recipe).

### step_usages
The join between steps and ingredient_slots. Records which slots are used in which step, with the quantity and prep state needed *at that step*. A single slot may appear in multiple steps.

### ingredients (personal library)
The user's cached ingredient database. Each entry has: name, aliases (so "my protein powder" resolves), brand (optional), macros_per_100g (calories, protein, carbs, fat, fiber), serving_size and serving_unit (e.g. "30g scoop"), custom notes. This is the **first** place macro resolution looks, before falling back to USDA.

---

## Agent Design

### Identity and Authorship
The agent has its own author identity in the version history. Every variant it creates records author=agent, the diff, and a descriptive commit message (e.g. "swapped mascarpone → Greek yogurt + gelatin to preserve set; protein +18g, fat −22g").

### Propose/Approve Flow (PR Model)
- The agent can only create versions in **"proposed" (draft)** status
- The user sees the diff: ingredient changes + macro delta side by side
- The user approves or rejects
- This keeps the tree clean and mirrors the PR review pattern

### Agent Context
When chatting about a recipe, the agent receives:
- The full recipe tree (current version + variant history)
- Computed macros for the current version
- The user's ingredient library
- The conversation history scoped to this recipe

### Agent Tools (MCP Server)
The backend exposes these as MCP tools, callable by the agent:

- `get_recipe(id)` — returns the recipe with its full version tree
- `get_recipe_version(version_id)` — returns a specific version with steps, slots, and computed macros
- `search_ingredients(query)` — searches user's library first, then USDA
- `add_ingredient(name, macros, aliases, serving_size)` — adds to user's personal library (pending approval)
- `propose_variant(parent_version_id, changes, commit_message)` — creates a new draft version with the specified changes
- `compute_macros(version_id)` — computes and returns macro breakdown for a version, recursing into sub-recipes
- `compare_versions(version_a, version_b)` — returns a structured diff (ingredient changes + macro delta)

### Dual Surface
The same MCP server feeds both:
- The **web app's** embedded chat (user talks to agent in the UI)
- **Claude Code** in the terminal (user can manage recipes headlessly)

---

## Macro Engine

### Resolution Order
1. **User's personal ingredient library** (e.g. "My Whey Protein — Brand X, per 30g scoop: 120 cal, 25P/3C/1F")
2. **USDA FoodData Central API** (free, covers generic ingredients)
3. **Agent-assisted entry** — paste or photograph a nutrition label, agent extracts macros and calls `add_ingredient`

### Computation
- Store macros per canonical unit (per 100g) plus optional per-serving definition ("scoop = 30g")
- For sub-recipe slots: recursively compute the sub-recipe's macros per-unit, then multiply by the quantity used in the parent
- Snapshot computed macros on each version (so old versions retain their numbers even if ingredient data changes later)

---

## Cooklang Integration

Use Cooklang as an **import/export format**, not as the storage layer:
- **Import**: parse `.cook` files into the Batch data model (recipes, steps, ingredient slots). Cooklang's `@ingredient{qty%unit}` syntax maps cleanly to slots, and `@./sub-recipe{qty}` maps to sub-recipe references.
- **Export**: serialize a recipe version back to `.cook` format for portability, sharing, or use with Cooklang CLI tools.
- The real value (version tree, macro engine, agent, cooking UI) lives in Postgres, not in flat files.

---

## UI Views

### 1. Recipe Browser / Tree View
- List of all recipes with search and tags
- Selecting a recipe shows its variant tree visually (branches, which are approved vs. draft vs. rejected)
- Each node shows a macro summary badge (cal/P/C/F per serving)

### 2. Recipe Detail / Editor
- View a specific version: steps with inline ingredients, full macro breakdown
- Edit mode for manual changes (creates a new version)
- Slot resolution picker: for slots that reference sub-recipes, show what it currently resolves to and allow swapping

### 3. Diff / Approval View
- Side-by-side comparison of two versions
- Ingredient changes highlighted
- Macro delta displayed prominently (e.g. "protein +18g, fat −22g, calories −95")
- Approve / reject buttons for agent-proposed drafts

### 4. Cooking Mode
- One step per screen, large type, mobile-optimized
- Each step shows only the ingredients needed *for that step*, quantities scaled to current serving count
- Checkable steps (mark as done)
- Integrated timers (parsed from step data)
- No distractions — no tree, no macros, no agent. Just cook.

### 5. Agent Chat
- Chat panel (slide-out or dedicated view) scoped to the current recipe
- Agent can reference and display recipe data inline
- Proposed changes appear as interactive diffs in the chat

---

## Tech Stack (Recommended)

- **Database**: Postgres (Supabase or Neon free tier — Supabase gives auth for free when you add users later)
- **Backend/Frontend**: Next.js on Vercel (fullstack, SSR, API routes) OR FastAPI + React on Railway/Render
- **Agent**: Claude Agent SDK (TypeScript or Python) with the MCP tools defined above
- **Nutrition API**: USDA FoodData Central (free API key)
- **Cooklang Parsing**: cooklang-rs (Rust, has WASM bindings for browser) or cooklang-ts if available
- **Styling**: Tailwind CSS, mobile-first responsive

---

## MVP Scope (v1)

Build only these. Everything else is future:

- [ ] Recipe CRUD with the slot/interface model (ingredients tied to steps)
- [ ] Personal ingredient library with cached macros (CRUD + USDA lookup)
- [ ] Macro engine: per-ingredient macros, sub-recipe recursion, per-version snapshots
- [ ] Version tree: create variants, view lineage, immutable versions
- [ ] Agent chat scoped to a recipe: can search ingredients, propose variants (draft), compute macros
- [ ] Diff view: side-by-side version comparison with macro delta
- [ ] Cooking mode: step-by-step, scaled quantities, timers
- [ ] Cooklang import (parse `.cook` files into the data model)
- [ ] Responsive web app (mobile-compatible, no native app)
- [ ] Claude Code compatible: MCP server so the same backend works headlessly

### Explicitly NOT in v1:
- User auth / multi-user
- Social features (sharing, forking others' recipes, community)
- Pull request model from other users
- Meal planning / weekly plans
- Shopping list generation
- Cooklang export
- Image upload / photo of nutrition labels
- Deployment automation

---

## Design Principles

1. **Recipes are code.** Version them, diff them, branch them, review changes.
2. **The agent proposes, the human approves.** Never auto-commit. Always show the diff.
3. **Macros are computed, not guessed.** Real data from the user's library or USDA, recursed through sub-recipes, snapshotted per version.
4. **Ingredients live in steps.** Not a detached shopping list. The step IS the source of truth for what goes where.
5. **Immutability preserves history.** No editing in place. Every change is a new version. The tree tells the full story.
6. **Build for one user first.** The developer. If it's useful solo, it's worth existing.
