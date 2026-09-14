import type { RecipeStateKind } from "../../lib/viewmodel/state";
import { Mark, stateMark } from "./Mark";

/** A single state mark, mapped from the shared recipeState discriminant: a double square (excellent),
 *  a filled square (made), a struck square (needs work), or an open square (to-make). Idle = nothing. */
export function StateDot({ state }: { state: RecipeStateKind }) {
  const kind = stateMark(state);
  if (!kind) return null;
  const label = state === "excellent" ? "excellent" : state === "needs-work" ? "needs work" : state === "made" ? "made" : "to-make";
  return <Mark kind={kind} label={label} />;
}
