import type { RecipeStateKind } from "../../lib/viewmodel/state";

/** The sheet's state marks — drawn, never coloured. An open square is to-make, a filled square is
 *  tried, a double-ruled square is excellent, a struck square needs work. Note kinds use the same
 *  vocabulary: a triangle warns (pitfall), a diamond is a technique, a small square is a plain note. */
export type MarkKind = "open" | "filled" | "double" | "struck" | "pitfall" | "technique" | "note";

const STATE_MARK: Record<RecipeStateKind, MarkKind | null> = {
  excellent: "double", "needs-work": "struck", made: "filled", "to-make": "open", idle: null,
};
export const stateMark = (s: RecipeStateKind): MarkKind | null => STATE_MARK[s];

export function Mark({ kind, label, size = 10 }: { kind: MarkKind; label?: string; size?: number }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  const s = { width: size, height: size };
  switch (kind) {
    case "open":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><rect x=".75" y=".75" width="8.5" height="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "filled":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><rect x=".5" y=".5" width="9" height="9" fill="currentColor" /></svg>;
    case "double":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><rect x=".6" y=".6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.2" /><rect x="3" y="3" width="4" height="4" fill="currentColor" /></svg>;
    case "struck":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><rect x=".75" y=".75" width="8.5" height="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M1.5 8.5 8.5 1.5" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "pitfall":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><path d="M5 1 9.4 9H.6Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "technique":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "note":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><rect x="2.5" y="2.5" width="5" height="5" fill="currentColor" /></svg>;
  }
}
