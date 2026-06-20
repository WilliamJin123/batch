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
const FAR_SCALE = 0.55;  // below this, nodes collapse to a title-only card (semantic zoom)
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
    const onMove = (e: MouseEvent) => { const pc = pan.current; if (!pc) return; panMoved.current = true; const nox = e.clientX - pc.sx, noy = e.clientY - pc.sy; setT((p) => ({ ...p, ox: nox, oy: noy })); };
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

  // touch: 1-finger drag pans, 2-finger pinch zooms (mobile). Native non-passive so
  // preventDefault() stops the browser's own scroll/zoom and the synthesized mouse events.
  useEffect(() => {
    const board = boardRef.current; if (!board) return;
    let tpan: { sx: number; sy: number } | null = null;
    let pinch: { d0: number; s0: number; mx: number; my: number; ox0: number; oy0: number } | null = null;
    let moved = false;
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const onStart = (e: TouchEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(".node") || el.closest(".bopill")) return; // let node taps / pill hovers through
      if (e.touches.length === 1) {
        setSmooth(false); moved = false; pinch = null;
        tpan = { sx: e.touches[0].clientX - tRef.current.ox, sy: e.touches[0].clientY - tRef.current.oy };
        e.preventDefault();
      } else if (e.touches.length === 2) {
        setSmooth(false); tpan = null;
        const r = board.getBoundingClientRect(), a = e.touches[0], b = e.touches[1];
        pinch = { d0: dist(a, b), s0: tRef.current.scale, mx: (a.clientX + b.clientX) / 2 - r.left, my: (a.clientY + b.clientY) / 2 - r.top, ox0: tRef.current.ox, oy0: tRef.current.oy };
        e.preventDefault();
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length >= 2 && pinch.d0 > 0) {
        e.preventDefault();
        const ns = clampS(pinch.s0 * (dist(e.touches[0], e.touches[1]) / pinch.d0)), k = ns / pinch.s0;
        setT({ scale: ns, ox: pinch.mx - k * (pinch.mx - pinch.ox0), oy: pinch.my - k * (pinch.my - pinch.oy0) });
      } else if (tpan && e.touches.length === 1) {
        e.preventDefault(); moved = true;
        // capture offsets as primitives — never deref tpan/the Touch inside the updater,
        // which React can replay after touchend has nulled tpan (intermittent crash).
        const nox = e.touches[0].clientX - tpan.sx, noy = e.touches[0].clientY - tpan.sy;
        setT((p) => ({ ...p, ox: nox, oy: noy }));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) { pinch = null; pushHist(tRef.current); }
      if (tpan && e.touches.length === 0) { tpan = null; if (moved) { moved = false; pushHist(tRef.current); } }
    };
    board.addEventListener("touchstart", onStart, { passive: false });
    board.addEventListener("touchmove", onMove, { passive: false });
    board.addEventListener("touchend", onEnd);
    board.addEventListener("touchcancel", onEnd);
    return () => {
      board.removeEventListener("touchstart", onStart);
      board.removeEventListener("touchmove", onMove);
      board.removeEventListener("touchend", onEnd);
      board.removeEventListener("touchcancel", onEnd);
    };
  }, [pushHist]);

  // keyboard pan — hold arrows / WASD to glide the canvas (so traversing isn't endless dragging).
  // Momentum model: velocity eases toward a target, so a quick tap is a fine nudge and a held key is a
  // smooth cruise. Speed tiers use ONLY browser-safe keys — Shift = sprint, Space = slow/precise — and
  // any Ctrl/Cmd/Alt combo is ignored, because the OS/browser steal those: mac Ctrl+←/→ switches Spaces,
  // Windows Ctrl+W closes the tab, Cmd/Alt+← go back, etc. Shift is the only modifier left untouched.
  const openCardRef = useRef(openCard); useEffect(() => { openCardRef.current = openCard; }, [openCard]);
  useEffect(() => {
    const MOVE = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"]);
    const down = new Set<string>();
    const vel = { x: 0, y: 0 };
    let raf = 0, last = 0;
    const BASE = 1150, SPRINT = 2.5, SLOW = 0.3;   // px/sec cruise + modifier multipliers
    const ACCEL = 11, FRICTION = 14;               // velocity easing rates (per sec)

    const tick = (ts: number) => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
      last = ts;
      let dx = 0, dy = 0;
      if (down.has("arrowleft") || down.has("a")) dx += 1;
      if (down.has("arrowright") || down.has("d")) dx -= 1;
      if (down.has("arrowup") || down.has("w")) dy += 1;
      if (down.has("arrowdown") || down.has("s")) dy -= 1;
      if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; } // even speed on the diagonal
      const moving = dx !== 0 || dy !== 0;
      const mult = down.has("shift") ? SPRINT : down.has("space") ? SLOW : 1;
      const tx = dx * BASE * mult, ty = dy * BASE * mult;
      const ease = 1 - Math.exp(-(moving ? ACCEL : FRICTION) * dt);
      vel.x += (tx - vel.x) * ease;
      vel.y += (ty - vel.y) * ease;
      if (!moving && Math.abs(vel.x) < 1.5 && Math.abs(vel.y) < 1.5) {
        vel.x = vel.y = 0; raf = 0; last = 0;
        pushHist(tRef.current);  // one history entry per glide, just like a drag
        return;
      }
      const vx = vel.x, vy = vel.y;
      setT((p) => ({ ...p, ox: p.ox + vx * dt, oy: p.oy + vy * dt }));
      raf = requestAnimationFrame(tick);
    };
    const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };

    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName ?? "";
      if (el?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return;
      if (openCardRef.current) return;                  // card open → leave keys to the modal/page
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // never hijack real OS/browser shortcuts
      const k = e.key === " " ? "space" : e.key.toLowerCase();
      if (k === "shift") { down.add("shift"); return; }
      if (k === "space") { down.add("space"); e.preventDefault(); return; }
      if (!MOVE.has(k)) return;
      e.preventDefault();          // stop arrows from scrolling the page
      down.add(k);
      setSmooth(false);
      run();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key === " " ? "space" : e.key.toLowerCase();
      down.delete(k);              // friction eases it to a stop
    };
    const clear = () => down.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      if (raf) cancelAnimationFrame(raf);
    };
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
        <div className={`scene${t.scale < FAR_SCALE ? " far" : ""}${smooth ? " smooth" : ""}`} style={{ transform: `translate(${t.ox}px,${t.oy}px) scale(${t.scale})`, width, height, transition: smooth ? "transform .26s cubic-bezier(.22,.61,.36,1)" : "none" }}>
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
        <button className="fbtn ico mobhide" onClick={() => zoom(BTN_STEP)} aria-label="Zoom in">+</button>
        <button className="fbtn ico mobhide" onClick={() => zoom(1 / BTN_STEP)} aria-label="Zoom out">−</button>
        <button className="fbtn" onClick={fit} aria-label="Fit graph">⤢ Fit</button>
        <span className="tdiv" />
        <div className="legendbox">
          <button className={`fbtn${legendOpen ? " on" : ""}`} onClick={() => setLegendOpen((o) => !o)} aria-label="Toggle legend" aria-expanded={legendOpen}>▦ Legend</button>
          {legendOpen && <div className="legendpop"><Legend /></div>}
        </div>
      </div>

      <div className="panhint">arrows / WASD to move · shift sprint · space slow · scroll to zoom · click a node</div>

      <div className={`drawer${drawerOpen ? " open" : ""}`} aria-hidden={!drawerOpen}>
        <TreeOutline graph={graph} focus={focus} onPick={pickFromDrawer} onClose={() => setDrawerOpen(false)} />
      </div>

      {openCard && cards[openCard] && <CardModal card={cards[openCard]} onClose={() => setOpenCard(null)} onNavigate={navInCard} />}
    </div>
  );
}
