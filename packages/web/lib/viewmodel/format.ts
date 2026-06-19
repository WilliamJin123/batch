import type { Rating } from "@batch/core";
/** Natural quantity string: trims trailing zeros, spells units as authored. */
export function qtyNatural(value: number, unit: string): string {
  const v = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  return unit === "each" ? v : `${v} ${unit}`;
}
export function roundGrams(g?: number): number | undefined {
  if (g === undefined) return undefined;
  return g < 10 ? Math.round(g * 10) / 10 : Math.round(g);
}
export type BakeCardRating = Rating | undefined;
export function ratingFrom(verdict?: Rating): BakeCardRating { return verdict; }
export function splitName(name: string): { title: string; paren?: string } {
  const m = name.match(/^(.*?)\s*(\([^)]*\))\s*$/);
  return m ? { title: m[1], paren: m[2] } : { title: name };
}
export const r0 = (n: number) => Math.round(n);
export const r1 = (n: number) => Math.round(n * 10) / 10;
