"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { EdgeLayer } from "./EdgeLayer";
import { RecipeNode } from "./RecipeNode";
import { TreeOutline } from "./TreeOutline";
import { Legend } from "./Legend";
import { BakeoffPill } from "./BakeoffPill";
import { CardModal } from "./CardModal";
import type { BakeCardVM, BakeoffNote, TreeGraphVM } from "../../lib/viewmodel/types";
import type { Pos } from "../../lib/layout/graphLayout";

const MIN_SCALE = 0.2, MAX_SCALE = 2.6, INIT_SCALE = 0.95;
const WHEEL_K = 0.0045;  // wheel/pinch sensitivity (higher = snappier)
const BTN_STEP = 1.25;   // per-click zoom factor for the +/- buttons
const HIST_MAX = 60;     // navigation undo/redo depth
const clampS = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

type View = { ox: number; oy: number; scale: number };
const sameView = (a: View, b: View) => a.ox === b.ox && a.oy === b.oy && a.scale === b.scale;

export function TreeView({ graph, pos, width, height, cards }: {
  graph: TreeGraphVM; pos: Record<string, Pos>; width: number; height: number; cards: Record<string, BakeCardVM>;
}) {
  const posMap = new Map(Object.entries(pos));
  const boardRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<View>({ ox: 24, oy: 8, scale: 1 });
  const [smooth, setSmooth] = useState(false);          // animate the scene transform (buttons / undo-redo)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [nav, setNav] = useState({ canUndo: false, canRedo: false });
  const pan = useRef<{ sx: number; sy: number } | null>(null);
  const panMoved = useRef(false);
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- view + navigation history (undo/redo) -----
  const tRef = useRef(t); useEffect(() => { tRef.current = t; }, [t]);
  const hist = useRef<View[]>([]);
  const hi = useRef(-1);
  const syncNav = () => setNav({ canUndo: hi.current > 0, canRedo: hi.current < hist.current.length - 1 });

  const pushHist = useCallback((v: View) => {
    const h = hist.current.slice(0, hi.current + 1);
    if (h.length && sameView(h[h.length - 1], v)) return; // ignore no-op moves
    h.push(v);
    while (h.length > HIST_MAX) h.shift();
    hist.current = h; hi.current = h.length - 1; syncNav();
  }, []);

  // a discrete navigation action: animate to the view AND record it
  const goTo = useCallback((v: View) => { setSmooth(true); setT(v); pushHist(v); }, [pushHist]);

  // frame the whole graph into the viewport (both axes), centred — the Fit button
  const fit = useCallback(() => {
    const board = boardRef.current; if (!board) return;
    const bw = board.clientWidth, bh = board.clientHeight, pad = 56;
    const scale = clampS(Math.min(1.1, Math.min((bw - pad) / width, (bh - pad) / height)));
    goTo({ scale, ox: (bw - width * scale) / 2, oy: (bh - height * scale) / 2 });
  }, [width, height, goTo]);

  // first paint: start zoomed in at the top-left of the tree (roots/bases) — seeds history[0]
  const initialView = useCallback(() => {
    const board = boardRef.current; if (!board) return;
    const bh = board.clientHeight, sh = height * INIT_SCALE;
    const v = { scale: INIT_SCALE, ox: 40, oy: sh <= bh - 48 ? (bh - sh) / 2 : 28 };
    setSmooth(false); setT(v);
    hist.current = [v]; hi.current = 0; syncNav();
  }, [height]);
  useEffect(() => { initialView(); }, [initialView]);

  const zoom = (factor: number) => {
    const board = boardRef.current; if (!board) return;
    const cx = board.clientWidth / 2, cy = board.clientHeight / 2, p = tRef.current;
    const ns = clampS(p.scale * factor), k = ns / p.scale;
    goTo({ scale: ns, ox: cx - k * (cx - p.ox), oy: cy - k * (cy - p.oy) });
  };

  const undo = useCallback(() => { if (hi.current <= 0) return; hi.current--; setSmooth(true); setT(hist.current[hi.current]); syncNav(); }, []);
  const redo = useCallback(() => { if (hi.current >= hist.current.length - 1) return; hi.current++; setSmooth(true); setT(hist.current[hi.current]); syncNav(); }, []);

  // pan continues even when the cursor leaves the board → listen on window; commit one history entry per drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (!pan.current) return; panMoved.current = true; setT((p) => ({ ...p, ox: e.clientX - pan.current!.sx, oy: e.clientY - pan.current!.sy })); };
    const onUp = () => { if (!pan.current) return; pan.current = null; boardRef.current?.classList.remove("grabbing"); if (panMoved.current) { panMoved.current = false; pushHist(tRef.current); } };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [pushHist]);

  // wheel-zoom around the cursor; native non-passive so preventDefault() works (React onWheel is passive)
  useEffect(() => {
    const board = boardRef.current; if (!board) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSmooth(false); // gestures track the cursor 1:1, no tween
      const r = board.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      // exp() keeps zoom stable + symmetric even on fast momentum/pinch bursts
      setT((p) => { const ns = clampS(p.scale * Math.exp(-e.deltaY * WHEEL_K)); const k = ns / p.scale; return { scale: ns, ox: mx - k * (mx - p.ox), oy: my - k * (my - p.oy) }; });
      if (wheelEnd.current) clearTimeout(wheelEnd.current);
      wheelEnd.current = setTimeout(() => pushHist(tRef.current), 280); // commit when the gesture settles
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, [pushHist]);

  const onDown = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest(".node") || el.closest(".bopill")) return; // let node clicks / pill hovers through
    setSmooth(false);
    pan.current = { sx: e.clientX - t.ox, sy: e.clientY - t.oy };
    panMoved.current = false;
    boardRef.current?.classList.add("grabbing");
  };

  const centerOn = useCallback((id: string) => {
    const p = posMap.get(id), board = boardRef.current; if (!p || !board) return;
    setFocus(id);
    const prev = tRef.current;
    goTo({ scale: prev.scale, ox: board.clientWidth / 2 - (p.x + p.w / 2) * prev.scale, oy: board.clientHeight / 2 - (p.y + p.h / 2) * prev.scale });
  }, [posMap, goTo]);

  const openFromNode = (id: string) => { setFocus(id); setOpenCard(id); };
  const pickFromDrawer = (id: string) => { setDrawerOpen(false); centerOn(id); setOpenCard(id); };
  const navInCard = (id: string) => { if (cards[id]) { centerOn(id); setOpenCard(id); } };

  const arm = new Map<string, "A" | "B">();
  for (const b of graph.bakeoffs) { arm.set(b.a, "A"); arm.set(b.b, "B"); }

  // bake-off brackets: connect the two arms along whichever axis they're separated on
  // (side-by-side → facing vertical edges; stacked → facing horizontal edges), pill at the midpoint
  const connectors = graph.bakeoffs.map((b) => {
    const a = posMap.get(b.a), bb = posMap.get(b.b);
    if (!a || !bb) return null;
    const dx = Math.abs((a.x + a.w / 2) - (bb.x + bb.w / 2)), dy = Math.abs((a.y + a.h / 2) - (bb.y + bb.h / 2));
    let ax, ay, bx, by;
    if (dx >= dy) { // side by side: right edge of the left box ↔ left edge of the right box
      const [L, R] = a.x <= bb.x ? [a, bb] : [bb, a];
      ax = L.x + L.w; ay = L.y + L.h / 2; bx = R.x; by = R.y + R.h / 2;
    } else { // stacked: bottom of the upper box ↔ top of the lower box
      const [U, D] = a.y <= bb.y ? [a, bb] : [bb, a];
      ax = U.x + U.w / 2; ay = U.y + U.h; bx = D.x + D.w / 2; by = D.y;
    }
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    return { note: b.note as BakeoffNote, ax, ay, bx, by, mx, my };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  const composes = graph.edges.filter((e) => e.rel === "composes").length;

  return (
    <div className="treepage">
      <div className="board" ref={boardRef} onMouseDown={onDown}>
        <div className="scene" style={{ transform: `translate(${t.ox}px,${t.oy}px) scale(${t.scale})`, width, height, transition: smooth ? "transform .26s cubic-bezier(.22,.61,.36,1)" : "none" }}>
          <EdgeLayer edges={graph.edges} pos={posMap} connectors={connectors} width={width} height={height} />
          {graph.nodes.map((n) => <RecipeNode key={n.recipeId} node={n} pos={posMap.get(n.recipeId)!} arm={arm.get(n.recipeId)} selected={focus === n.recipeId} onOpen={openFromNode} />)}
          {connectors.map((c, i) => <BakeoffPill key={i} note={c.note} pos={{ x: c.mx, y: c.my }} />)}
        </div>
      </div>

      <div className="tctl tl">
        <button className={`fbtn${drawerOpen ? " on" : ""}`} onClick={() => setDrawerOpen((o) => !o)} aria-label="Toggle recipes">☰ Recipes</button>
        <div className="ttitle">Recipe Tree <span>{graph.nodes.length} recipes · {composes} compositions · {graph.bakeoffs.length} bake-off{graph.bakeoffs.length === 1 ? "" : "s"}</span></div>
      </div>

      <div className="tctl tr">
        <button className="fbtn ico" onClick={undo} disabled={!nav.canUndo} aria-label="Undo view (navigation)">↶</button>
        <button className="fbtn ico" onClick={redo} disabled={!nav.canRedo} aria-label="Redo view (navigation)">↷</button>
        <span className="tdiv" />
        <button className="fbtn ico" onClick={() => zoom(BTN_STEP)} aria-label="Zoom in">+</button>
        <button className="fbtn ico" onClick={() => zoom(1 / BTN_STEP)} aria-label="Zoom out">−</button>
        <button className="fbtn" onClick={fit} aria-label="Fit graph">⤢ Fit</button>
      </div>

      <div className="tctl bl legendbox">
        {legendOpen && <div className="legendpop"><Legend /></div>}
        <button className={`fbtn${legendOpen ? " on" : ""}`} onClick={() => setLegendOpen((o) => !o)} aria-label="Toggle legend" aria-expanded={legendOpen}>▦ Legend</button>
      </div>
      <div className="panhint">scroll to zoom · drag to pan · click a node to open its card</div>

      <div className={`drawer${drawerOpen ? " open" : ""}`} aria-hidden={!drawerOpen}>
        <TreeOutline graph={graph} focus={focus} onPick={pickFromDrawer} onClose={() => setDrawerOpen(false)} />
      </div>

      {openCard && cards[openCard] && <CardModal card={cards[openCard]} onClose={() => setOpenCard(null)} onNavigate={navInCard} />}
    </div>
  );
}
