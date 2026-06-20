"use client";
import { useState, useRef, useEffect } from "react";
import type { TreeGraphVM, TreeNodeVM } from "../../lib/viewmodel/types";
import { StateDot } from "../shared/StateDot";

/** The "all recipes" drawer: a live filter over every recipe, grouped by family.
 *  Picking a row centres that node in the canvas and opens its card. */
export function TreeOutline({ graph, focus, open, onPick, onClose }: {
  graph: TreeGraphVM; focus: string | null; open: boolean; onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  // when the drawer opens (e.g. via the "/" hotkey) drop the cursor straight into search
  useEffect(() => { if (open) { const id = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(id); } }, [open]);
  const ql = q.trim().toLowerCase();
  const searching = ql.length > 0;
  const match = (n: TreeNodeVM) =>
    !searching ||
    n.name.toLowerCase().includes(ql) ||
    n.family.toLowerCase().includes(ql) ||
    n.tags.some((t) => t.toLowerCase().includes(ql));

  const families = new Map<string, TreeNodeVM[]>();
  let total = 0;
  for (const n of graph.nodes) {
    if (!match(n)) continue;
    total++;
    (families.get(n.family) ?? families.set(n.family, []).get(n.family)!).push(n);
  }
  const isOpen = (f: string) => searching || !closed[f];
  const flat = [...families.values()].flat();   // top match for Enter-to-open

  return (
    <div className="drawer-inner">
      <div className="dhead">
        <span className="dt">All recipes</span>
        <button className="dx" onClick={onClose} aria-label="Close recipes">✕</button>
      </div>
      <input ref={inputRef} className="dq" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && flat[0]) { e.preventDefault(); onPick(flat[0].recipeId); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
        placeholder="Search name, family, or tag…" aria-label="Search recipes" />
      <div className="dct">{total} of {graph.nodes.length}</div>
      <div className="dlist">
        {[...families.entries()].map(([fam, nodes]) => (
          <div key={fam}>
            <div className="tol-row grp" onClick={() => setClosed((c) => ({ ...c, [fam]: isOpen(fam) }))}>
              <span className="tol-tw">{isOpen(fam) ? "▾" : "▸"}</span>
              <span className="tol-nm">{fam}</span>
              <span className="tol-ct">{nodes.length}</span>
            </div>
            {isOpen(fam) && nodes.map((n) => (
              <div key={n.recipeId} className={`tol-row ind1${focus === n.recipeId ? " on" : ""}`} role="button" tabIndex={0}
                onClick={() => onPick(n.recipeId)}
                onKeyDown={(e) => { if (e.key === "Enter") onPick(n.recipeId); }}>
                <span className="tol-tw" />
                <span className="tol-nm">{n.name}{n.kind === "base" && <span className="basel">base</span>}{n.needsTuning && <span className="flag">tune</span>}</span>
                <StateDot made={n.made} rating={n.rating} />
              </div>
            ))}
          </div>
        ))}
        {total === 0 && <div className="dempty">No recipes match “{q}”.</div>}
      </div>
      <div className="railsum"><span className="star">★</span> excellent &nbsp; <span className="dotg" /> good &nbsp; <span className="ringa" /> to-make</div>
    </div>
  );
}
