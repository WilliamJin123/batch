import type { LibraryIngredient } from "./types.js";
import { normalizeUnit } from "./units.js";

// Volume units → millilitres (mirrors units.ts; kept local so display has no cross-import of the
// private tables). Only the three a cook actually reaches for.
const TSP_ML = 4.92892159375;
const TBSP_ML = 14.78676478125;
const CUP_ML = 236.5882365;

// Count/"each"-style units we'll surface as a cook unit when there's no sensible volume. `scoop`
// is handled separately (it's the natural unit for protein powders and wins outright). Order = the
// preference when an ingredient defines more than one.
const COUNT_PREF = [
  "each", "pinch", "cookie", "sheet", "bar", "slice", "candy",
  "triangle", "ladyfinger", "cake", "clove", "apple", "banana", "square",
];
// A real protein scoop is ~25-35 g. Below this, a "scoop" equivalence is a data quirk (e.g. vanilla
// extract's 4.3 g "scoop") and must NOT win over the natural volume unit (tsp).
const MIN_SCOOP_G = 10;

export interface CookQty { value: number; unit: string }

type UnitSource = Pick<LibraryIngredient, "densityGPerMl" | "unitEquivalences">;

/**
 * Derive the cook-friendly unit (cups/spoons/scoops/each…) for a gram amount of an ingredient —
 * the human half of the always-shown "<cook unit> · <grams> g" pair. Derived from GRAMS, never
 * from however the quantity was originally entered, so the display is consistent across recipes.
 *
 * Priority: scoop (real protein scoop only) → volume (largest readable of cup/tbsp/tsp, via a packed
 * unitEquivalence or density) → count unit (each/pinch/… only when no volume exists, e.g. eggs).
 * Returns undefined when nothing is derivable (the ingredient lacks density + equivalences) — the
 * caller then shows grams alone.
 */
export function naturalCookUnit(grams: number, ing: UnitSource): CookQty | undefined {
  if (!(grams > 0)) return undefined;
  const eq = ing.unitEquivalences ?? {};
  const eqg = (u: string): number | undefined => {
    for (const [k, g] of Object.entries(eq)) if (normalizeUnit(k) === u) return g;
    return undefined;
  };

  // 1) a genuine protein scoop wins — the way you actually measure powder
  const scoopG = eqg("scoop");
  if (scoopG !== undefined && scoopG >= MIN_SCOOP_G && grams / scoopG >= 0.25) {
    return { value: grams / scoopG, unit: "scoop" };
  }

  // 2) volume — a packed unitEquivalence beats density; pick the largest unit that stays readable
  const cupG = eqg("cup") ?? (ing.densityGPerMl !== undefined ? ing.densityGPerMl * CUP_ML : undefined);
  const tbspG = eqg("tbsp") ?? (ing.densityGPerMl !== undefined ? ing.densityGPerMl * TBSP_ML : undefined);
  const tspG = eqg("tsp") ?? (ing.densityGPerMl !== undefined ? ing.densityGPerMl * TSP_ML : undefined);
  if (cupG !== undefined && grams / cupG >= 0.25) return { value: grams / cupG, unit: "cup" };
  if (tbspG !== undefined && grams / tbspG >= 0.875) return { value: grams / tbspG, unit: "tbsp" };
  if (tspG !== undefined && grams / tspG >= 0.25) return { value: grams / tspG, unit: "tsp" };

  // 3) count unit (eggs, a pinch of salt) — only reached when there's no readable volume
  for (const u of COUNT_PREF) {
    const g = eqg(u);
    if (g !== undefined && grams / g >= 0.5) return { value: grams / g, unit: u };
  }

  // 4) last resort: a sub-readable volume is still better than a raw gram count for a near-zero-
  // density powder, so emit the smallest available volume rather than nothing
  if (tspG !== undefined) return { value: grams / tspG, unit: "tsp" };
  if (tbspG !== undefined) return { value: grams / tbspG, unit: "tbsp" };
  if (cupG !== undefined) return { value: grams / cupG, unit: "cup" };
  return undefined;
}

// Nearest "nice" fraction (eighths + thirds), as a unicode glyph. 1 rolls into the whole number.
const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [0, ""], [0.125, "⅛"], [0.25, "¼"], [0.333, "⅓"], [0.375, "⅜"], [0.5, "½"],
  [0.625, "⅝"], [0.667, "⅔"], [0.75, "¾"], [0.875, "⅞"], [1, ""],
];
const ABBREV = new Set(["tbsp", "tsp", "g", "oz", "ml"]); // never pluralised

function pluralize(unit: string, value: number): string {
  if (ABBREV.has(unit) || unit === "each") return unit;
  if (value <= 1) return unit;
  return unit.endsWith("s") ? unit : unit + "s";
}

/** Render a {value, unit} as a cook would write it: "2¾ tbsp", "1½ scoops", "1 each", "⅓ cup". */
export function formatCookQty(q: CookQty): string {
  const whole = Math.floor(q.value + 1e-9);
  const frac = q.value - whole;
  let best: readonly [number, string] = [0, ""], bestDist = Infinity;
  for (const f of FRACTIONS) {
    const d = Math.abs(frac - f[0]);
    if (d < bestDist) { bestDist = d; best = f; }
  }
  let [fracVal, glyph] = best;
  let n = whole;
  if (fracVal === 1) { n += 1; fracVal = 0; glyph = ""; }       // rolled up to the next whole
  if (n === 0 && !glyph) { glyph = "⅛"; fracVal = 0.125; }      // never render a bare "0"
  const displayed = n + fracVal;
  const num = glyph ? `${n > 0 ? n : ""}${glyph}` : String(n);
  return `${num} ${pluralize(q.unit, displayed)}`.trim();
}

/** Convenience: the cook-unit string for a gram amount, or undefined when not derivable. */
export function cookUnitLabel(grams: number, ing: UnitSource): string | undefined {
  const q = naturalCookUnit(grams, ing);
  return q ? formatCookQty(q) : undefined;
}
