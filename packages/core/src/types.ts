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
  createdAt: string; // ISO-8601
}

export interface Recipe {
  id: RecipeId;
  createdBy: Author;
  createdAt: string;
  headVersionId: VersionId;
}
