"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { EdgeLayer } from "./EdgeLayer";
import { RecipeNode } from "./RecipeNode";
import { TreeOutline } from "./TreeOutline";
import { Legend } from "./Legend";
import { BakeoffPill } from "./BakeoffPill";
import type { TreeGraphVM } from "../../lib/viewmodel/types";
import type { Pos } from "../../lib/layout/graphLayout";

export function TreeView({ graph, pos, width, height }: {
  graph: TreeGraphVM; pos: Record<string, Pos>; width: number; height: number;
}) {
  const posMap = new Map(Object.entries(pos));
  const boardRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ ox: 24, oy: 8, scale: 1 });
  const [collapsed, setCollapsed] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const pan = useRef<{ sx: number; sy: number } | null>(null);

  const fit = useCallback(() => {
    const w = boardRef.current?.clientWidth ?? 1000;
    const scale = Math.min(1, (w - 24) / width);
    setT({ scale, ox: Math.max(12, (w - width * scale) / 2), oy: 8 });
  }, [width]);
  useEffect(() => { fit(); }, [fit]);

  // pan continues even when the cursor leaves the board → listen on window
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (!pan.current) return; setT((p) => ({ ...p, ox: e.clientX - pan.current!.sx, oy: e.clientY - pan.current!.sy })); };
    const onUp = () => { pan.current = null; boardRef.current?.classList.remove("grabbing"); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // wheel-zoom around the cursor; native non-passive so preventDefault() works (React onWheel is passive)
  useEffect(() => {
    const board = boardRef.current; if (!board) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = board.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      setT((p) => { const ns = Math.min(2, Math.max(0.35, p.scale * (1 - e.deltaY * 0.0016))); const k = ns / p.scale; return { scale: ns, ox: mx - k * (mx - p.ox), oy: my - k * (my - p.oy) }; });
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, []);

  const onDown = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest(".node") || el.closest(".bopill")) return; // let node clicks / pill hovers through
    pan.current = { sx: e.clientX - t.ox, sy: e.clientY - t.oy };
    boardRef.current?.classList.add("grabbing");
  };

  const centerOn = (id: string) => {
    const p = posMap.get(id), board = boardRef.current; if (!p || !board) return;
    setFocus(id);
    setT((prev) => ({ scale: prev.scale, ox: board.clientWidth / 2 - (p.x + p.w / 2) * prev.scale, oy: board.clientHeight / 2 - (p.y + p.h / 2) * prev.scale }));
  };

  const arm = new Map<string, "A" | "B">();
  for (const b of graph.bakeoffs) { arm.set(b.a, "A"); arm.set(b.b, "B"); }
  const bopos = (aId: string, bId: string) => { const a = posMap.get(aId), b = posMap.get(bId); if (!a || !b) return { x: 0, y: 0 }; return { x: (a.x + b.x) / 2 + 24, y: (a.y + b.y) / 2 + 30 }; };

  const composes = graph.edges.filter((e) => e.rel === "composes").length;
  return (
    <div className={`wrap${collapsed ? " collapsed" : ""}`}>
      <div className="rail"><TreeOutline graph={graph} focus={focus} onJump={centerOn} /></div>
      <div className="main">
        <div className="chead">
          <div>
            <h1>Recipe Tree</h1>
            <div className="csub">{graph.nodes.length} recipes · {composes} compositions · {graph.bakeoffs.length} bake-off{graph.bakeoffs.length === 1 ? "" : "s"}</div>
          </div>
          <div className="ctrls">
            <button className="btn" onClick={() => { setCollapsed((c) => !c); setTimeout(fit, 210); }}>{collapsed ? "❯ Show tree" : "❮ Hide tree"}</button>
            <button className="btn" onClick={fit}>⤢ Fit</button>
          </div>
        </div>
        <Legend />
        <div className="boardwrap" ref={boardRef} onMouseDown={onDown}>
          <div className="scene" style={{ transform: `translate(${t.ox}px,${t.oy}px) scale(${t.scale})`, width, height }}>
            <EdgeLayer edges={graph.edges} pos={posMap} width={width} height={height} />
            {graph.nodes.map((n) => <RecipeNode key={n.recipeId} node={n} pos={posMap.get(n.recipeId)!} arm={arm.get(n.recipeId)} selected={focus === n.recipeId} />)}
            {graph.bakeoffs.map((b, i) => <BakeoffPill key={i} note={b.note} pos={bopos(b.a, b.b)} />)}
          </div>
          <div className="panhint">scroll to zoom · drag to pan · click a node → open its card</div>
        </div>
      </div>
    </div>
  );
}
