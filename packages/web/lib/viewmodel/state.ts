import type { Rating } from "@batch/core";

/** One canonical recipe state, ordered best→plain. The single place the made/rating/queued precedence
 *  lives — every surface (node card status line, drawer/table dot) maps this discriminant to its own
 *  glyphs/labels instead of re-deriving the precedence. */
export type RecipeStateKind = "excellent" | "needs-work" | "made" | "to-make" | "idle";

export function recipeState(r: { kind: string; made: boolean; rating?: Rating; queued: boolean }): RecipeStateKind {
  if (r.kind === "sub-recipe") return "idle"; // components carry no tasting status
  if (r.rating === "excellent") return "excellent";
  if (r.made && r.rating === "bad") return "needs-work";
  if (r.made) return "made";
  if (r.queued) return "to-make";
  return "idle"; // untried, not queued (e.g. an idle base)
}

/** The node-card status line: border class + glyph + label (null = render nothing). The "made" label is
 *  the actual rating (good/okay) so the card keeps reading the real verdict. */
export function nodeStatus(state: RecipeStateKind, rating?: Rating): { cls: string; glyph: string; label: string } | null {
  switch (state) {
    case "excellent": return { cls: "exc", glyph: "★", label: "excellent" };
    case "needs-work": return { cls: "bad", glyph: "▲", label: "needs work" };
    case "made": return { cls: "good", glyph: "●", label: rating ?? "good" };
    case "to-make": return { cls: "tomake", glyph: "○", label: "to make" };
    case "idle": return null;
  }
}
