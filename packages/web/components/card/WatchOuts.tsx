import type { BakeCardVM } from "../../lib/viewmodel/types";
import { Mark, type MarkKind } from "../shared/Mark";

const noteMark = (k: string): MarkKind => (k === "pitfall" ? "pitfall" : k === "technique" ? "technique" : "note");

/**
 * The recipe-level "Watch-outs" block: pitfalls to avoid + techniques worth doing, read before you
 * start. Rendered between the hero and the body grid so it stays prominent on phone and desktop alike.
 * Step-specific notes also appear inline in the method; this is the glanceable preview up top.
 */
export function WatchOuts({ notes }: { notes: BakeCardVM["notes"] }) {
  if (!notes.length) return null;
  return (
    <section className="watchouts" aria-label="Watch-outs and tips">
      <h2 className="wo-h">Watch-outs</h2>
      <div className="wo-list">
        {notes.map((n, i) => (
          <div className={`wo-item ${n.kind}`} key={i}>
            <span className="wo-g"><Mark kind={noteMark(n.kind)} /></span>
            <span className="wo-k">{n.kind}</span>
            <span className="wo-t">{n.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
