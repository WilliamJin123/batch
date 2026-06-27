import type { LibraryIngredient, Macros, MacroLine, MacroSnapshot, RecipeContent, StepUsage, Yield } from "./types.js";
import { cookUnitLabel } from "./display.js";

export interface CardMeta {
  name: string;
  description?: string;
  yield: Yield;
}

/** Just the fields the cook-unit derivation needs, keyed by ingredient id. */
export type UnitInfo = Pick<LibraryIngredient, "densityGPerMl" | "unitEquivalences">;

const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);
const fmtGrams = (g: number): string => String(g < 10 ? Math.round(g * 10) / 10 : Math.round(g));
const macroLine = (m: Macros): string =>
  `${Math.round(m.calories)} cal · ${fmtNum(m.protein)} g protein · ${fmtNum(m.carbs)} C · ${fmtNum(m.fat)} F · ${fmtNum(m.fiber)} fiber`;
const singular = (unit: string): string => (unit.endsWith("s") ? unit.slice(0, -1) : unit);
const noteGlyph = (kind: string): string => (kind === "pitfall" ? "⚠" : kind === "technique" ? "◆" : "•");

/**
 * Render a recipe (already flattened) as a phone-readable markdown bake card:
 * title + description, a macro table with the cal/g-protein ratio, ingredients
 * grouped by section, then numbered method steps by section. Pure — no I/O.
 *
 * Section order: parent sections by step order first, then sub-recipe sections
 * (whose steps all carry a flatten `/` prefix) alphabetically, as a components appendix.
 */
export function renderCard(
  meta: CardMeta, content: RecipeContent, macros: MacroSnapshot,
  ingredients?: Map<string, UnitInfo>,
): string {
  const lines: string[] = [];

  // Each usage aligns by index with its macro line (the grams basis). The displayed quantity is
  // canonical: a derived cook unit (cups/spoons/scoops, from grams) PLUS grams — never the raw unit
  // a quantity happened to be entered in. Falls back to the entered unit only when grams is unknown
  // (unresolved ingredient) or no ingredient map was supplied.
  const lineByUsage = new Map<string, MacroLine>();
  content.usages.forEach((u, i) => { const ln = macros.lines[i]; if (ln) lineByUsage.set(u.componentKey, ln); });
  const qtyOf = (u: StepUsage): string => {
    const ln = lineByUsage.get(u.componentKey);
    const grams = ln?.grams;
    if (grams != null) {
      const info = ingredients && ln?.ingredientId ? ingredients.get(ln.ingredientId) : undefined;
      const cook = info ? cookUnitLabel(grams, info) : undefined;
      return cook ? `${cook} · ${fmtGrams(grams)} g` : `${fmtGrams(grams)} g`;
    }
    return `${fmtNum(u.quantityValue)} ${u.quantityUnit}`;
  };
  lines.push(`# ${meta.name}`, "");
  if (meta.description) lines.push(`_${meta.description}_`, "");

  const ratio =
    macros.caloriesPerGramProtein ??
    (macros.total.protein > 0 ? macros.total.calories / macros.total.protein : undefined);
  lines.push("## Macros", "");
  lines.push(`- **Per ${singular(meta.yield.unit)}** (1 of ${fmtNum(meta.yield.amount)}): ${macroLine(macros.perServing)}`);
  lines.push(`- **Whole (${fmtNum(meta.yield.amount)} ${meta.yield.unit})**: ${macroLine(macros.total)}`);
  if (ratio !== undefined) lines.push(`- **Ratio: ${fmtNum(Math.round(ratio * 10) / 10)} cal/g protein**`);
  if (macros.basis === "partial") lines.push("- _macros partial — some ingredients unresolved_");
  lines.push("");

  // Watch-outs: every pitfall (so the "don't ruin it" set always previews up top) plus any
  // recipe-level technique/note. Step-anchored notes ALSO render inline under their step, below.
  const notes = content.notes ?? [];
  const panel = notes.filter((nt) => nt.kind === "pitfall" || !nt.stepKey);
  if (panel.length) {
    lines.push("## Watch-outs", "");
    for (const nt of panel) lines.push(`- ${noteGlyph(nt.kind)} **${nt.kind}** — ${nt.text}`);
    lines.push("");
  }

  const slotName = new Map(content.slots.map((s) => [s.componentKey, s.name] as const));
  const stepSection = new Map(content.steps.map((s) => [s.componentKey, s.section ?? "Base"] as const));
  const minOrder = new Map<string, number>();
  const allChild = new Map<string, boolean>();
  for (const s of content.steps) {
    const sec = s.section ?? "Base";
    minOrder.set(sec, Math.min(minOrder.get(sec) ?? Infinity, s.order));
    allChild.set(sec, (allChild.get(sec) ?? true) && s.componentKey.includes("/"));
  }
  // An ingredient's section comes from its step; if that step is absent the usage
  // falls back to "Base". Register any such section so its ingredients never vanish
  // from the card (they sort after real parent sections, with no method steps).
  for (const u of content.usages) {
    const sec = stepSection.get(u.stepKey) ?? "Base";
    if (!minOrder.has(sec)) { minOrder.set(sec, Infinity); allChild.set(sec, false); }
  }
  const sections = [...minOrder.keys()].sort((a, b) => {
    const ca = allChild.get(a) ? 1 : 0;
    const cb = allChild.get(b) ? 1 : 0;
    if (ca !== cb) return ca - cb; // parent sections before sub-recipe sections
    if (ca === 1) return a.localeCompare(b); // sub-recipes alphabetical
    return (minOrder.get(a) ?? 0) - (minOrder.get(b) ?? 0); // parents by step order
  });

  lines.push("## Ingredients", "");
  for (const sec of sections) {
    const us = content.usages.filter((u) => (stepSection.get(u.stepKey) ?? "Base") === sec);
    if (!us.length) continue;
    lines.push(`**${sec}**`);
    for (const u of us) lines.push(`- ${slotName.get(u.slotKey) ?? u.slotKey} — ${qtyOf(u)}`);
    lines.push("");
  }

  lines.push("## Method", "");
  for (const sec of sections) {
    const steps = content.steps.filter((s) => (s.section ?? "Base") === sec).sort((a, b) => a.order - b.order);
    if (!steps.length) continue;
    lines.push(`### ${sec}`, "");
    steps.forEach((s, i) => {
      const temp = s.temperature ? ` (${s.temperature}°F)` : "";
      lines.push(`${i + 1}. ${s.instructionText}${temp}`);
      for (const nt of notes.filter((x) => x.stepKey === s.componentKey))
        lines.push(`   - ${noteGlyph(nt.kind)} _${nt.text}_`);
    });
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
