import type { BakeoffNote } from "../../lib/viewmodel/types";
import { r0, r1 } from "../../lib/viewmodel/format";

const ratio = (v: number | null) => (v != null ? r1(v) : "—");

/** `pos` is the bracket's pill anchor — the midpoint between two arms, or the centre of the comb
 *  spine for three+. The pill centres on it; the SVG bracket in EdgeLayer threads through it. */
export function BakeoffPill({ note, pos }: { note: BakeoffNote; pos: { x: number; y: number } }) {
  const n = note.arms.length;
  return (
    <div className="bopill" tabIndex={0} style={{ left: pos.x, top: pos.y, transform: "translate(-50%,-50%)" }}>
      bake-off · {n}
      <div className="bonote">
        <b>{n} arms, one target — bake {n === 2 ? "both" : `all ${n}`}, keep the winner.</b>
        {note.arms.map((a) => (
          <div className="bln" key={a.recipeId}><span className="ba">{a.label}</span><span>{a.name}</span><i>{r0(a.cal)} cal · {ratio(a.calPerGramProtein)} cal/g · makes {a.servings}</i></div>
        ))}
        {note.differingIngredients.length > 0 && (
          <div className="bvs"><em>differs in</em> {note.differingIngredients.map((d) => d.name).join(", ")}</div>
        )}
      </div>
    </div>
  );
}
