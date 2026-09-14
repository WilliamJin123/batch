import type { BakeCardVM } from "../../lib/viewmodel/types";
import { Mark, type MarkKind } from "../shared/Mark";

const noteMark = (k: string): MarkKind => (k === "pitfall" ? "pitfall" : k === "technique" ? "technique" : "note");

export function Method({ sections }: { sections: BakeCardVM["method"] }) {
  return (
    <section className="method" aria-label="Method">
      <h2 className="sh">Method <span className="kc">{sections.reduce((n, s) => n + s.steps.length, 0)} steps</span></h2>
      {sections.map((sec, si) => (
        <div className="msec" key={si}>
          {sections.length > 1 && <h3 className="msub">{sec.section}</h3>}
          {sec.steps.map((st, i) => (
            <div className="step" key={i}>
              <span className="n">{i + 1}</span>
              <span className="t">
                {(st.tempF || st.minutes) ? <span className="temp">{[st.tempF ? `${st.tempF}°F` : null, st.minutes ? `~${st.minutes} min` : null].filter(Boolean).join(" · ")}</span> : null}{st.text}
                {st.ingredients.length > 0 && (
                  <span className="sing">
                    {st.ingredients.map((g, j) => (
                      <span className="schip" key={j}><b>{g.qtyFull}</b>{g.name}</span>
                    ))}
                  </span>
                )}
                {st.notes && st.notes.length > 0 && (
                  <span className="snotes">
                    {st.notes.map((n, j) => (
                      <span className={`snote ${n.kind}`} key={j}><span className="sg"><Mark kind={noteMark(n.kind)} label={n.kind} size={9} /></span>{n.text}</span>
                    ))}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
