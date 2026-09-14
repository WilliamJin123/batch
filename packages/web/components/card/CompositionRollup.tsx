import type { BakeCardVM, MacroVM } from "../../lib/viewmodel/types";
import { r0, r1 } from "../../lib/viewmodel/format";

export function CompositionRollup({ rows, whole, perServing, servings }: {
  rows: BakeCardVM["composition"]; whole: MacroVM; perServing: MacroVM; servings: number;
}) {
  return (
    <section className="block" aria-label="Composition">
      <h2 className="sh">Composition <span className="kc">macros roll up</span></h2>
      <div className="ctbl">
        {rows.map((row, i) => (
          <div className="crow" key={i}><span className="cn">{row.name}</span><span className="cv">{r0(row.calories)} cal · {r1(row.protein)} g P</span></div>
        ))}
        <div className="crow tot"><span className="cn">Whole batch ({servings})</span><span className="cv">{r0(whole.calories).toLocaleString("en-US")} cal · {r1(whole.protein)} g P</span></div>
        <div className="crow per"><span className="cn">Per serving</span><span className="cv">{r0(perServing.calories)} cal · {r1(perServing.protein)} g P</span></div>
      </div>
    </section>
  );
}
