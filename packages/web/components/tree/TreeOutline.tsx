"use client";
import { useState } from "react";
import type { TreeGraphVM, TreeNodeVM } from "../../lib/viewmodel/types";
import { StateDot } from "../shared/StateDot";

export function TreeOutline({ graph, focus, onJump }: {
  graph: TreeGraphVM; focus: string | null; onJump: (id: string) => void;
}) {
  const families = new Map<string, TreeNodeVM[]>();
  for (const n of graph.nodes) { (families.get(n.family) ?? families.set(n.family, []).get(n.family)!).push(n); }
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (f: string) => open[f] ?? true;
  return (
    <>
      <div className="rt"><span>All recipes</span><span>{graph.nodes.length}</span></div>
      <div className="tree-ol">
        {[...families.entries()].map(([fam, nodes]) => (
          <div key={fam}>
            <div className="tol-row grp" onClick={() => setOpen((o) => ({ ...o, [fam]: !isOpen(fam) }))}>
              <span className="tol-tw">{isOpen(fam) ? "▾" : "▸"}</span>
              <span className="tol-nm">{fam}</span>
              <span className="tol-ct">{nodes.length}</span>
            </div>
            {isOpen(fam) && nodes.map((n) => (
              <div key={n.recipeId} className={`tol-row ind1${focus === n.recipeId ? " on" : ""}`} onClick={() => onJump(n.recipeId)}>
                <span className="tol-tw" />
                <span className="tol-nm">{n.name}{n.kind === "base" && <span className="basel">base</span>}{n.needsTuning && <span className="flag">tune</span>}</span>
                <StateDot made={n.made} rating={n.rating} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="railsum"><span className="star">★</span> excellent &nbsp; <span className="dotg" /> good &nbsp; <span className="ringa" /> to-make</div>
    </>
  );
}
