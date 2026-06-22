import type { IngredientSlot, Note, RecipeContent, Step, StepUsage, Yield } from "./types.js";
import { subRecipeFraction } from "./sub-recipe.js";

export interface SubContent {
  content: RecipeContent;
  yield: Yield;
  totalGrams: number;
  name: string;
}

/**
 * Expand sub_recipe slots into the child's own steps + ingredients (M3, DM3-3). A derived
 * read — never stored. Child quantities are scaled by `scale × fraction` (same ladder the
 * macro engine uses, so the flattened card and the macro rollup agree by construction).
 * Component keys are prefixed per nesting level to avoid collisions; child steps are
 * sectioned under the child's name. When a usage's fraction can't be resolved, the whole
 * batch is shown (fraction 1) — the macro engine remains the source of truth for the number.
 */
export function flattenContent(
  content: RecipeContent,
  subContents: Map<string, SubContent>,
  scale = 1,
  prefix = "",
): RecipeContent {
  const slotByKey = new Map(content.slots.map((s) => [s.componentKey, s]));
  const steps: Step[] = [];
  const slots: IngredientSlot[] = [];
  const usages: StepUsage[] = [];
  const notes: Note[] = [];

  for (const step of content.steps) {
    steps.push({ ...step, componentKey: prefix + step.componentKey });
  }
  for (const note of content.notes ?? []) {
    notes.push({ ...note, componentKey: prefix + note.componentKey, ...(note.stepKey ? { stepKey: prefix + note.stepKey } : {}) });
  }
  for (const slot of content.slots) {
    if (slot.resolution.kind === "raw") slots.push({ ...slot, componentKey: prefix + slot.componentKey });
    // sub_recipe slots are replaced by the child's own slots, below
  }
  for (const usage of content.usages) {
    const slot = slotByKey.get(usage.slotKey);
    if (!slot) continue;
    if (slot.resolution.kind === "raw") {
      usages.push({
        ...usage,
        componentKey: prefix + usage.componentKey,
        stepKey: prefix + usage.stepKey,
        slotKey: prefix + usage.slotKey,
        quantityValue: usage.quantityValue * scale,
      });
      continue;
    }
    const child = subContents.get(slot.resolution.subRecipeVersionId);
    if (!child) continue;
    const fr = subRecipeFraction(usage, child);
    const childScale = scale * ("fraction" in fr ? fr.fraction : 1);
    const childPrefix = prefix + usage.slotKey + "/";
    const flat = flattenContent(child.content, subContents, childScale, childPrefix);
    for (const s of flat.steps) steps.push({ ...s, section: s.section ?? child.name });
    for (const s of flat.slots) slots.push(s);
    for (const u of flat.usages) usages.push(u);
    for (const nt of flat.notes ?? []) notes.push(nt);
  }
  return { steps, slots, usages, notes };
}
