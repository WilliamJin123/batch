import type { BakeCardVM } from "../../lib/viewmodel/types";

const glyph = (k: string): string => (k === "pitfall" ? "⚠" : k === "technique" ? "◆" : "•");

export function Method({ sections }: { sections: BakeCardVM["method"] }) {
  return (
    <div className="method">
      <div className="sh" style={{ marginBottom: 18 }}>Method</div>
      {sections.map((sec, si) => (
        <div className="msec" key={si}>
          <p className="msub">{sec.section}</p>
          {sec.steps.map((st, i) => (
            <div className="step" key={i}>
              <span className="n">{i + 1}</span>
              <span className="t">
                {(st.tempF || st.minutes) ? <span className="temp">{[st.tempF ? `${st.tempF}°F` : null, st.minutes ? `~${st.minutes} min` : null].filter(Boolean).join(" · ")}</span> : null}{st.text}
                {st.ingredients.length > 0 && (
                  <span className="sing">
                    {st.ingredients.map((g, j) => (
                      <span className="schip" key={j}><b>{g.qtyNatural}</b>{g.name}</span>
                    ))}
                  </span>
                )}
                {st.notes && st.notes.length > 0 && (
                  <span className="snotes">
                    {st.notes.map((n, j) => (
                      <span className={`snote ${n.kind}`} key={j}><span className="sg" aria-hidden="true">{glyph(n.kind)}</span>{n.text}</span>
                    ))}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
