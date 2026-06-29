import type { BakeCardVM } from "../../lib/viewmodel/types";

export function TastingLog({ entries }: { entries: BakeCardVM["tastingLog"] }) {
  return (
    <div className="block">
      <div className="sh">Tasting log <span className="kc">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span></div>
      {entries.map((e, i) => {
        const plan = e.kind === "to-make";
        return (
          <div className={`log${plan ? " plan" : ""}`} key={i}>
            <div className="top"><span className="dot" /><span className="rate">{e.kind === "to-make" ? "To make" : (e.rating ?? "Made")}</span><span className="date">{e.date}</span></div>
            {e.note && <div className="note">{e.note}</div>}
          </div>
        );
      })}
    </div>
  );
}
