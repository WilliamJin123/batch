export type RecipeId = string;
export type VersionId = string;
export type ComponentKey = string;

export type Author = "user" | "agent" | "system";
export type VersionStatus = "draft" | "approved" | "rejected";

export interface Yield {
  amount: number;
  unit: string; // e.g. "squares", "g", "servings"
}

export interface Step {
  componentKey: ComponentKey;
  order: number;
  instructionText: string;
  section?: string;
  timerSeconds?: number;
  temperature?: number;
}

export type SlotResolution =
  | { kind: "raw"; libraryIngredientId: string }
  | { kind: "sub_recipe"; subRecipeVersionId: VersionId };

export interface IngredientSlot {
  componentKey: ComponentKey;
  name: string;
  prepDefault?: string;
  resolution: SlotResolution;
}

export interface StepUsage {
  componentKey: ComponentKey;
  stepKey: ComponentKey;
  slotKey: ComponentKey;
  quantityValue: number;
  quantityUnit: string;
  prepState?: string;
}

export interface RecipeContent {
  steps: Step[];
  slots: IngredientSlot[];
  usages: StepUsage[];
}

export type ComponentKind = "step" | "slot" | "usage";

export type OverrideEntry =
  | { op: "remove"; kind: ComponentKind; target: ComponentKey }
  | { op: "replace"; kind: "step"; target: ComponentKey; payload: Step }
  | { op: "replace"; kind: "slot"; target: ComponentKey; payload: IngredientSlot }
  | { op: "replace"; kind: "usage"; target: ComponentKey; payload: StepUsage }
  | { op: "add"; kind: "step"; payload: Step }
  | { op: "add"; kind: "slot"; payload: IngredientSlot }
  | { op: "add"; kind: "usage"; payload: StepUsage };

export interface OverrideSet {
  entries: OverrideEntry[];
  name?: string;
  yield?: Yield;
  tags?: string[];
}

export interface Macros {
  calories: number; // kcal
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  fiber: number; // grams
}

/**
 * A personal library ingredient: what a slot's `libraryIngredientId` resolves to
 * for macro computation. Mutable and unversioned (D9) — immutability is protected
 * by each version's frozen MacroSnapshot, not by versioning the ingredient.
 * Macros are canonical **per 100 g** (D8).
 */
export interface LibraryIngredient {
  id: string;
  name: string;
  aliases?: string[];
  brand?: string;
  macrosPer100g: Macros;
  /** Volume→mass bridge: grams per millilitre. Converts any volume unit (D8). */
  densityGPerMl?: number;
  /** Explicit "1 <unit> = N grams" (count units like `each`, or a packed solid's `cup`). Wins over the universal tables. */
  unitEquivalences?: Record<string, number>;
  notes?: string;
  source?: "user" | "usda";
  usdaFdcId?: string;
}

/** One usage's contribution to a version's macros — or why it couldn't be counted. */
export interface MacroLine {
  slotKey: ComponentKey;
  ingredientId?: string;
  ingredientName?: string;
  grams?: number;
  macros?: Macros; // this usage's contribution
  status: "ok" | "unresolved";
  reason?: string; // present iff unresolved
}

/**
 * Computed nutrition frozen onto a version at commit (UC19). `basis` is
 * `"partial"` when any usage is unresolved (unknown ingredient / unconvertible
 * unit / sub-recipe); the resolvable usages still sum (UC18 — never throws).
 */
export interface MacroSnapshot {
  total: Macros;
  perServing: Macros;
  yield: Yield;
  basis: "complete" | "partial";
  unresolved: string[];
  lines: MacroLine[];
  /** calories ÷ grams of protein — the lean-bake north-star metric. Absent when protein is 0. */
  caloriesPerGramProtein?: number;
}

/**
 * A pinned child sub-recipe's frozen macro view (M3), built by the service from the
 * child version's snapshot and handed to `computeMacros` / `flattenContent`.
 */
export interface SubRecipeMacro {
  total: Macros;
  yield: Yield;
  totalGrams: number;
  basis: "complete" | "partial";
}

/** Provenance + staleness for one sub-recipe spliced into a flattened recipe (M3). */
export interface FlattenSource {
  versionId: VersionId;
  recipeName: string;
  behind: number;
}

export interface RecipeVersion {
  id: VersionId;
  recipeId: RecipeId;
  prevVersionId?: VersionId; // history edge
  derivesFromVersionId?: VersionId; // inheritance edge; absent => root
  name: string;
  description?: string;
  tags: string[];
  yield: Yield;
  status: VersionStatus;
  author: Author;
  commitMessage: string;
  overrideSet?: OverrideSet; // present iff variant
  content: RecipeContent; // materialized snapshot, always present
  macros?: MacroSnapshot; // computed nutrition snapshot (UC19); set at commit
  parentVersionIds?: VersionId[]; // amalgam provenance (CM-7) — pure metadata, no materialization
  provenanceNote?: string; // rationale for a synthesized champion
  createdAt: string; // ISO-8601
}

export interface Recipe {
  id: RecipeId;
  createdBy: Author;
  createdAt: string;
  headVersionId: VersionId;
}

// --- Feedback (tasting log) — append-only, orthogonal to the version chain ---

/** Ordinal, worst→best. `excellent` is the "favorite"/starred tier. */
export type Rating = "bad" | "okay" | "good" | "excellent";
export type FeedbackKind = "to-make" | "made";

export interface FeedbackBase {
  id: string;
  recipeId: RecipeId;            // lineage — for rollup
  versionId: VersionId;          // the exact version tasted/queued (provenance)
  componentKey?: ComponentKey;   // optional target within that version (e.g. sl-glaze)
  notes?: string;
  date: string;                  // when baked/queued (ISO-8601)
  author: Author;
  createdAt: string;             // when the record was written (ISO-8601)
}

export type FeedbackEntry =
  | ({ kind: "to-make" } & FeedbackBase)                 // intent — no rating
  | ({ kind: "made"; rating?: Rating } & FeedbackBase);  // outcome — rating optional but encouraged
