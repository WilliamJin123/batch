"use client";
import { useState, useRef, useEffect } from "react";
import type { TreeGraphVM, TreeNodeVM } from "../../lib/viewmodel/types";
import { StateDot } from "../shared/StateDot";
import { matchesSearch } from "../../lib/search";

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** The "all recipes" drawer: a live filter over every recipe, grouped by family.
 *  Picking a row centres that node in the canvas and opens its card. */
export function TreeOutline({ graph, focus, open, onPick, onClose }: {
  graph: TreeGraphVM; focus: string | null; open: boolean; onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<{ n: TreeNodeVM; top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // when the drawer opens (e.g. via the "/" hotkey) drop the cursor straight into search
  useEffect(() => { if (open) { const id = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(id); } }, [open]);
  const searching = q.trim().length > 0;
  // one shared, punctuation/accent-insensitive substring matcher (see lib/search) so the tree
  // drawer and the recipes table behave identically — e.g. "smores" finds "Lean S'mores …".
  const match = (n: TreeNodeVM) => matchesSearch([n.name, n.family, ...n.tags], q);

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
        {/* no ✕ here — the floating "✕ Recipes" toggle that sits over this row already closes it */}
      </div>
      <input ref={inputRef} className="dq" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && flat[0]) { e.preventDefault(); onPick(flat[0].recipeId); } else if (e.key === "Escape" || e.key === "/") { e.preventDefault(); onClose(); } }}
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
                onKeyDown={(e) => { if (e.key === "Enter") onPick(n.recipeId); }}
                onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ n, top: r.top, left: r.right + 10 }); }}
                onMouseLeave={() => setHover((h) => (h?.n.recipeId === n.recipeId ? null : h))}>
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
      {hover && (
        <div className="tol-pop" data-testid="tol-pop" style={{ top: hover.top, left: hover.left }}>
          <b>{hover.n.name}</b>
          <div className="tp-mac">{r0(hover.n.cal)} cal · {r1(hover.n.protein)}g P · {r1(hover.n.carbs)}g C · {r1(hover.n.fat)}g F</div>
          <div className="tp-sub">
            {hover.n.calPerGramProtein != null ? `${r1(hover.n.calPerGramProtein)} cal/g protein` : "ratio —"} · makes {hover.n.servings} {hover.n.servingUnit}
          </div>
          {hover.n.servings > 1 && <div className="tp-sub">whole: {r0(hover.n.wholeCal).toLocaleString("en-US")} cal · {r0(hover.n.wholeProtein)}g P</div>}
        </div>
      )}
    </div>
  );
}
