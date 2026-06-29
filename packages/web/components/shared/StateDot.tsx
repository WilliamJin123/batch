import type { RecipeStateKind } from "../../lib/viewmodel/state";

/** A single status glyph, mapped from the shared recipeState discriminant: a star (excellent),
 *  a filled dot (made / needs-work), or a hollow ring (to-make / idle). */
export function StateDot({ state }: { state: RecipeStateKind }) {
  if (state === "excellent") return <span className="star" aria-label="excellent">★</span>;
  if (state === "made" || state === "needs-work") return <span className="dotg" aria-label="made" />;
  return <span className="ringa" aria-label="to-make" />;
}
