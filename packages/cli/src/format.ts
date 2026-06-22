import type { Macros, MacroSnapshot } from "@batch/core";

const n = (x: number): string => String(Math.round(x * 100) / 100);
const singular = (unit: string): string => (unit.endsWith("s") ? unit.slice(0, -1) : unit);
const macroLine = (m: Macros): string =>
  `${Math.round(m.calories)} cal · ${n(m.protein)}P · ${n(m.carbs)}C · ${n(m.fat)}F · ${n(m.fiber)} fiber`;

function ratioSuffix(snap: MacroSnapshot): string {
  const r = snap.caloriesPerGramProtein ?? (snap.total.protein > 0 ? snap.total.calories / snap.total.protein : undefined);
  return r === undefined ? "" : `  (${Math.round(r * 10) / 10} cal/g protein)`;
}

function isMacroSnapshot(v: any): v is MacroSnapshot {
  return v && typeof v === "object" && v.total && v.perServing && v.yield && typeof v.basis === "string";
}

function renderMacros(snap: MacroSnapshot): string {
  const out = [
    `macros (${snap.basis})`,
    `  per ${singular(snap.yield.unit)}: ${macroLine(snap.perServing)}${ratioSuffix(snap)}`,
    `  whole (${n(snap.yield.amount)} ${snap.yield.unit}): ${macroLine(snap.total)}`,
  ];
  if (snap.unresolved.length) out.push(`  unresolved (${snap.unresolved.length}): ${snap.unresolved.join("; ")}`);
  return out.join("\n");
}

function renderBySection(v: { snapshot: MacroSnapshot; bySection: Record<string, Macros> }): string {
  const out = [renderMacros(v.snapshot), "", "by section:"];
  for (const [sec, m] of Object.entries(v.bySection)) out.push(`  ${sec}: ${macroLine(m)}`);
  return out.join("\n");
}

function renderList(rows: any[]): string {
  const nameW = Math.max(...rows.map((r) => String(r.name).length), 4);
  return rows
    .map((r) => {
      const id = String(r.headVersionId).slice(0, 8);
      const kind = r.kind ? r.kind.padEnd(7) : "";
      const kcal = r.kcalPerServing != null ? `${Math.round(r.kcalPerServing)} cal/srv` : "";
      const tags = (r.tags ?? []).length ? `[${r.tags.join(",")}]` : "";
      const marks = [r.queued ? "☐ to-make" : "", r.tried ? `✓ ${r.verdict ?? "made"}` : ""].filter(Boolean).join(" ");
      return `${String(r.name).padEnd(nameW)}  ${id}  ${kind}  ${kcal.padStart(10)}  ${tags} ${marks}`.trimEnd();
    })
    .join("\n");
}

function renderIngredientLine(i: any): string {
  return `${i.name} (${i.id}): ${macroLine(i.macrosPer100g)} /100g`;
}
function renderIngredient(i: any): string {
  const extra = [
    i.brand ? `brand: ${i.brand}` : "",
    i.densityGPerMl ? `density: ${i.densityGPerMl} g/ml` : "",
    i.aliases?.length ? `aka: ${i.aliases.join(", ")}` : "",
    i.notes ? `notes: ${i.notes}` : "",
  ].filter(Boolean);
  return [`${i.name}  (${i.id})`, `  per 100 g: ${macroLine(i.macrosPer100g)}`, ...extra.map((e: string) => `  ${e}`)].join("\n");
}

function renderVersion(v: any): string {
  const out = [`${v.name}  (${String(v.id).slice(0, 8)} · ${v.status})`];
  if (v.description) out.push(v.description);
  out.push(`yield: ${n(v.yield.amount)} ${v.yield.unit}`);
  if (v.macros) out.push(renderMacros(v.macros));
  const slotName = new Map((v.content?.slots ?? []).map((s: any) => [s.componentKey, s.name]));
  if (v.content?.usages?.length) {
    out.push("", "ingredients:");
    for (const u of v.content.usages) out.push(`  - ${slotName.get(u.slotKey) ?? u.slotKey}: ${n(u.quantityValue)} ${u.quantityUnit}`);
  }
  if (v.content?.steps?.length) {
    out.push("", "steps:");
    for (const s of [...v.content.steps].sort((a: any, b: any) => a.order - b.order)) {
      out.push(`  ${s.order}. ${s.section ? `[${s.section}] ` : ""}${s.instructionText}`);
    }
  }
  if (v.content?.notes?.length) {
    out.push("", "notes:");
    for (const nt of v.content.notes) {
      out.push(`  ${nt.kind}${nt.stepKey ? ` [${nt.stepKey}]` : ""}: ${nt.text}`);
    }
  }
  return out.join("\n");
}

/** Render a command's return value as scannable text. Falls back to pretty JSON for unrecognized shapes. */
export function renderHuman(value: unknown): string {
  const v: any = value;
  if (v == null) return "(none)";
  if (typeof v === "string") return v;
  if (isMacroSnapshot(v)) return renderMacros(v);
  if (typeof v === "object" && v.snapshot && v.bySection) return renderBySection(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "(none)";
    const first = v[0];
    if (first && typeof first === "object" && "headVersionId" in first && "name" in first) return renderList(v);
    if (first && typeof first === "object" && "macrosPer100g" in first) return v.map(renderIngredientLine).join("\n");
    return JSON.stringify(v, null, 2);
  }
  if (typeof v === "object" && "macrosPer100g" in v) return renderIngredient(v);
  if (typeof v === "object" && "content" in v && "name" in v && "yield" in v) return renderVersion(v);
  return JSON.stringify(v, null, 2);
}
