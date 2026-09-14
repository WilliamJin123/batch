import type { RecipeStateKind } from "../../lib/viewmodel/state";

/** The sheet's state marks — drawn, never coloured. An open star is to-make, a filled star is
 *  tried, a ringed star is excellent, a struck star needs work. Note kinds keep the plainer
 *  vocabulary: a triangle warns (pitfall), a diamond is a technique, a small square is a plain note. */
export type MarkKind = "open" | "filled" | "double" | "struck" | "pitfall" | "technique" | "note";

const STATE_MARK: Record<RecipeStateKind, MarkKind | null> = {
  excellent: "double", "needs-work": "struck", made: "filled", "to-make": "open", idle: null,
};
export const stateMark = (s: RecipeStateKind): MarkKind | null => STATE_MARK[s];

// a five-point star in a 10×10 box (the ring for "double" needs the .75 inset; other kinds fill it)
const STAR = "M5 .5l1.3 2.9 3.2.3-2.4 2.1.7 3.1L5 7.3 2.2 8.9l.7-3.1L.5 3.7l3.2-.3z";
const STAR_SMALL = "M5 2.6l.8 1.7 1.9.2-1.4 1.3.4 1.9L5 6.8 3.3 7.7l.4-1.9-1.4-1.3 1.9-.2z";

export function Mark({ kind, label, size = 10 }: { kind: MarkKind; label?: string; size?: number }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  const s = { width: size, height: size };
  switch (kind) {
    case "open":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>;
    case "filled":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><path d={STAR} fill="currentColor" stroke="currentColor" strokeWidth=".6" strokeLinejoin="round" /></svg>;
    case "double":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><circle cx="5" cy="5" r="4.5" fill="none" stroke="currentColor" strokeWidth=".9" /><path d={STAR_SMALL} fill="currentColor" /></svg>;
    case "struck":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="M1 9.2 9.2 .8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
    case "pitfall":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><path d="M5 1 9.4 9H.6Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "technique":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "note":
      return <svg className="mk" viewBox="0 0 10 10" style={s} {...a11y}><rect x="2.5" y="2.5" width="5" height="5" rx="1" fill="currentColor" /></svg>;
  }
}
