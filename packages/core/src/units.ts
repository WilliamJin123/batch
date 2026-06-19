import type { LibraryIngredient } from "./types.js";

// Universal mass table → grams (D8). Ingredient-independent.
const MASS_TO_GRAM: Record<string, number> = {
  mg: 0.001, milligram: 0.001, milligrams: 0.001,
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125,
  lb: 453.59237, lbs: 453.59237, pound: 453.59237, pounds: 453.59237,
};

// Universal volume table → millilitres (D8). Ingredient-independent.
// Volume→mass is *never* in here — it routes through the ingredient's density.
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  tsp: 4.92892159375, teaspoon: 4.92892159375, teaspoons: 4.92892159375,
  tbsp: 14.78676478125, tablespoon: 14.78676478125, tablespoons: 14.78676478125,
  cup: 236.5882365, cups: 236.5882365,
  floz: 29.5735295625, "fl oz": 29.5735295625,
  pint: 473.176473, pints: 473.176473, quart: 946.352946, quarts: 946.352946,
  gallon: 3785.411784, gallons: 3785.411784,
};

export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, " ");
}

export type GramResult = { grams: number } | { reason: string };

/**
 * Convert a quantity to grams (D8 — gram-canonical). Priority:
 *   1. the ingredient's `unitEquivalences` (most specific: "1 each = 50 g", a packed "1 cup = 120 g")
 *   2. the universal mass table (ingredient-independent)
 *   3. the universal volume table × the ingredient's density (the volume↔mass bridge)
 * Anything else is unconvertible → returns a `reason` (the caller lists it as
 * unresolved). Never throws.
 */
export function toGrams(
  value: number,
  unit: string,
  ingredient: Pick<LibraryIngredient, "densityGPerMl" | "unitEquivalences">,
): GramResult {
  const u = normalizeUnit(unit);

  const eq = ingredient.unitEquivalences;
  if (eq) {
    for (const [key, grams] of Object.entries(eq)) {
      if (normalizeUnit(key) === u) return { grams: value * grams };
    }
  }

  const mass = MASS_TO_GRAM[u];
  if (mass !== undefined) return { grams: value * mass };

  const ml = VOLUME_TO_ML[u];
  if (ml !== undefined) {
    if (ingredient.densityGPerMl !== undefined) {
      return { grams: value * ml * ingredient.densityGPerMl };
    }
    return { reason: `no density for volume unit "${unit}" — set densityGPerMl or unitEquivalences["${unit}"]` };
  }

  return { reason: `unknown unit "${unit}" — add unitEquivalences["${unit}"] in grams` };
}

/**
 * Convert within a single dimension only — mass↔mass or volume↔volume (D8). Identical
 * units pass through (so count/batch units like "batch" → "batch" return the value).
 * Returns `undefined` across dimensions or for unknown units; volume↔mass never lives here.
 */
export function convertWithin(value: number, fromUnit: string, toUnit: string): number | undefined {
  const f = normalizeUnit(fromUnit);
  const t = normalizeUnit(toUnit);
  if (f === t) return value;
  const fm = MASS_TO_GRAM[f], tm = MASS_TO_GRAM[t];
  if (fm !== undefined && tm !== undefined) return (value * fm) / tm;
  const fv = VOLUME_TO_ML[f], tv = VOLUME_TO_ML[t];
  if (fv !== undefined && tv !== undefined) return (value * fv) / tv;
  return undefined;
}

/** Grams iff `unit` is a universal mass unit; otherwise `undefined` (never touches density). */
export function massToGrams(value: number, unit: string): number | undefined {
  const m = MASS_TO_GRAM[normalizeUnit(unit)];
  return m === undefined ? undefined : value * m;
}
