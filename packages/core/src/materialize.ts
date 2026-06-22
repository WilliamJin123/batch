import type {
  ComponentKind, IngredientSlot, Note, OverrideEntry, OverrideSet,
  RecipeContent, Step, StepUsage,
} from "./types.js";

function arrayFor(content: RecipeContent, kind: ComponentKind): Array<{ componentKey: string }> {
  switch (kind) {
    case "step": return content.steps as Array<{ componentKey: string }>;
    case "slot": return content.slots as Array<{ componentKey: string }>;
    case "usage": return content.usages as Array<{ componentKey: string }>;
    case "note": return (content.notes ??= []) as Array<{ componentKey: string }>;
  }
}

function applyEntry(content: RecipeContent, entry: OverrideEntry): void {
  const arr = arrayFor(content, entry.kind);
  if (entry.op === "add") {
    arr.push(entry.payload as Step & IngredientSlot & StepUsage & Note);
    return;
  }
  const idx = arr.findIndex((c) => c.componentKey === entry.target);
  if (idx === -1) {
    throw new Error(`override target not found: ${entry.kind} ${entry.target}`);
  }
  if (entry.op === "remove") {
    arr.splice(idx, 1);
  } else {
    arr[idx] = entry.payload as Step & IngredientSlot & StepUsage & Note;
  }
}

export function materialize(base: RecipeContent, overrides: OverrideSet): RecipeContent {
  const out: RecipeContent = structuredClone(base);
  for (const entry of overrides.entries) applyEntry(out, entry);
  return out;
}
