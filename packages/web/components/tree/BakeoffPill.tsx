import type { BakeoffNote } from "../../lib/viewmodel/types";
import { r0, r1 } from "../../lib/viewmodel/format";

const ratio = (v: number | null) => (v != null ? r1(v) : "—");

/** `pos` is the midpoint between the two arms; the pill centres on it (the SVG
 *  bracket in EdgeLayer threads through the same point). */
export function BakeoffPill({ note, pos }: { note: BakeoffNote; pos: { x: number; y: number } }) {
  return (
    <div className="bopill" style={{ left: pos.x, top: pos.y, transform: "translate(-50%,-50%)" }}>
      bake-off <span className="info">i</span>
      <div className="bonote">
        <b>Two arms, one target — bake both, keep the winner.</b>
        <div className="bln"><span className="ba">A</span>{note.a.name} <i>{r0(note.a.cal)} cal · {ratio(note.a.calPerGramProtein)} cal/g · {note.a.servings}</i></div>
        <div className="bln"><span className="ba">B</span>{note.b.name} <i>{r0(note.b.cal)} cal · {ratio(note.b.calPerGramProtein)} cal/g · {note.b.servings}</i></div>
        {note.differingIngredients.length > 0 && (
          <div className="bvs"><em>differs in</em><br />{note.differingIngredients.map((d) => d.name).join(", ")}</div>
        )}
      </div>
    </div>
  );
}
