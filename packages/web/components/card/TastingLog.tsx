import type { BakeCardVM } from "../../lib/viewmodel/types";
import { Mark, type MarkKind } from "../shared/Mark";

const markFor = (e: BakeCardVM["tastingLog"][number]): MarkKind =>
  e.kind === "to-make" ? "open" : e.rating === "excellent" ? "double" : e.rating === "bad" ? "struck" : "filled";

export function TastingLog({ entries }: { entries: BakeCardVM["tastingLog"] }) {
  return (
    <section className="block" aria-label="Tasting log">
      <h2 className="sh">Tasting log <span className="kc">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span></h2>
      {entries.map((e, i) => (
        <div className="log" key={i}>
          <div className="top"><Mark kind={markFor(e)} /><span className="rate">{e.kind === "to-make" ? "To make" : (e.rating ?? "Made")}</span><span className="date">{e.date}</span></div>
          {e.note && <div className="note">{e.note}</div>}
        </div>
      ))}
    </section>
  );
}
