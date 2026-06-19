import type { BakeCardVM } from "../../lib/viewmodel/types";

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
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
