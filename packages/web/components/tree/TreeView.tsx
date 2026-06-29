"use client";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { EdgeLayer } from "./EdgeLayer";
import { RecipeNode } from "./RecipeNode";
import { TreeOutline } from "./TreeOutline";
import { Legend } from "./Legend";
import { BakeoffPill } from "./BakeoffPill";
import { CardModal } from "./CardModal";
import type { BakeCardVM, TreeGraphVM } from "../../lib/viewmodel/types";
import type { Pos } from "../../lib/layout/graphLayout";
import { buildConnectors } from "../../lib/layout/bakeoffConnectors";
import { loadView, saveView } from "../../lib/viewState";

const MIN_SCALE = 0.2, MAX_SCALE = 2.6, INIT_SCALE = 0.95;
const FAR_SCALE = 0.55;  // below this, nodes collapse to a title-only card (semantic zoom)
const WHEEL_K = 0.0045;  // wheel/pinch sensitivity (higher = snappier)
const BTN_STEP = 1.25;   // per-click zoom factor for the +/- buttons
const HIST_MAX = 60;     // navigation undo/redo depth
const clampS = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

type View = { ox: number; oy: number; scale: number };
const sameView = (a: View, b: View) => a.ox === b.ox && a.oy === b.oy && a.scale === b.scale;

export function TreeView({ graph, pos, width, height }: {
  graph: TreeGraphVM; pos: Record<string, Pos>; width: number; height: number;
}) {
  const posMap = useMemo(() => new Map(Object.entries(pos)), [pos]); // stable id→Pos map (the layout never moves)
  const boardRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<View>({ ox: 24, oy: 8, scale: 1 });
  const [smooth, setSmooth] = useState(false);          // animate the scene transform (buttons / undo-redo)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [card, setCard] = useState<BakeCardVM | null>(null);          // the loaded card for openCard (lazy-fetched)
  const cardCache = useRef<Map<string, BakeCardVM>>(new Map());        // fetched cards, kept for instant re-open
  const wantCardRef = useRef<string | null>(null);                    // latest requested id — guards against a stale fetch landing
  const [cameFromDrawer, setCameFromDrawer] = useState(false); // card opened from the search drawer → offer "← Results"
  const [nav, setNav] = useState({ canUndo: false, canRedo: false });
  const pan = useRef<{ sx: number; sy: number } | null>(null);
  const panMoved = useRef(false);
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hand keyboard control back to the canvas. The drawer only slides off-screen (translateX), so its
  // search input keeps DOM focus even when "closed" — and the canvas key handler bails on any focused
  // INPUT, so WASD/arrows would do nothing until you clicked. Re-focusing the (tabIndex=-1) board after
  // every open/close fixes that with no extra click. rAF so it lands after the close-triggered re-render.
  const focusBoard = useCallback(() => {
    requestAnimationFrame(() => boardRef.current?.focus({ preventScroll: true }));
  }, []);
  const closeDrawer = useCallback(() => { setDrawerOpen(false); focusBoard(); }, [focusBoard]);
  // when the card was reached from the search drawer, dismissing it returns you to your results (the
  // query + list survive — the drawer only slides off-screen); otherwise just hand keys back to the canvas
  const cameFromDrawerRef = useRef(false);
  const closeCard = useCallback(() => {
    setOpenCard(null);
    if (cameFromDrawerRef.current) { cameFromDrawerRef.current = false; setCameFromDrawer(false); setDrawerOpen(true); }
    else focusBoard();
  }, [focusBoard]);
  const backToResults = useCallback(() => { setOpenCard(null); cameFromDrawerRef.current = false; setCameFromDrawer(false); setDrawerOpen(true); }, []);

  // open a card by id: render it from cache instantly, else fetch the static /cards/<id> JSON (cards are
  // no longer all shipped to the page). wantCardRef guards a slow fetch landing after a newer open.
  const openCardId = useCallback((id: string) => {
    wantCardRef.current = id;
    setOpenCard(id);
    const cached = cardCache.current.get(id);
    if (cached) { setCard(cached); return; }
    setCard(null);
    fetch(`/cards/${id}`)
      .then((r) => (r.ok ? (r.json() as Promise<BakeCardVM>) : null))
      .then((c) => { if (c) { cardCache.current.set(id, c); if (wantCardRef.current === id) setCard(c); } })
      .catch(() => {});
  }, []);

  // ----- view + navigation history (undo/redo) -----
  const tRef = useRef(t); useEffect(() => { tRef.current = t; }, [t]);
  const drawerOpenRef = useRef(drawerOpen); useEffect(() => { drawerOpenRef.current = drawerOpen; }, [drawerOpen]); // for the touch handler (its effect closure is stale)
  // a CLOSED drawer is only translated off-screen, so without `inert` its search input + rows stay
  // Tab-focusable behind the canvas. Toggle the DOM `inert` property directly (cross-React-version safe).
  useEffect(() => { const el = drawerRef.current; if (el) (el as HTMLElement & { inert: boolean }).inert = !drawerOpen; }, [drawerOpen]);
  const hist = useRef<View[]>([]);
  const hi = useRef(-1);
  const syncNav = () => setNav({ canUndo: hi.current > 0, canRedo: hi.current < hist.current.length - 1 });

  const pushHist = useCallback((v: View) => {
    const h = hist.current.slice(0, hi.current + 1);
    if (h.length && sameView(h[h.length - 1]!, v)) return; // ignore no-op moves (h.length guards the index)
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

  // first paint: restore the last view from localStorage if we have one (so a reload keeps your zoom),
  // else start zoomed in at the top-left of the tree (roots/bases). Either way seeds history[0].
  const initialView = useCallback(() => {
    const board = boardRef.current; if (!board) return;
    const bh = board.clientHeight, sh = height * INIT_SCALE;
    const saved = loadView();
    const v = saved
      ? { ox: saved.ox, oy: saved.oy, scale: clampS(saved.scale) }
      : { scale: INIT_SCALE, ox: 40, oy: sh <= bh - 48 ? (bh - sh) / 2 : 28 };
    setSmooth(false); setT(v);
    hist.current = [v]; hi.current = 0; syncNav();
  }, [height]);
  useEffect(() => { initialView(); }, [initialView]);

  // persist the view (debounced) so the next entry restores it instead of snapping to the default
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveView(t), 200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [t]);

  // +/- buttons: zoom a step around the EXACT centre of the viewport. Applied instantly rather than via
  // a CSS transform-transition — interpolating the matrix slides the anchor off-centre mid-animation
  // (zoom-in drifts up, zoom-out drifts down). The keyboard +/- (rAF, re-anchored each frame) is smooth.
  const zoom = (factor: number) => {
    const board = boardRef.current; if (!board) return;
    const cx = board.clientWidth / 2, cy = board.clientHeight / 2, p = tRef.current;
    const ns = clampS(p.scale * factor), k = ns / p.scale;
    const v = { scale: ns, ox: cx - k * (cx - p.ox), oy: cy - k * (cy - p.oy) };
    setSmooth(false); setT(v); pushHist(v);
  };

  const undo = useCallback(() => { if (hi.current <= 0) return; hi.current--; setSmooth(true); setT(hist.current[hi.current]!); syncNav(); }, []);
  const redo = useCallback(() => { if (hi.current >= hist.current.length - 1) return; hi.current++; setSmooth(true); setT(hist.current[hi.current]!); syncNav(); }, []);

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
      if (drawerOpenRef.current) { setDrawerOpen(false); e.preventDefault(); return; } // tap the canvas to dismiss the recipe drawer
      if (e.touches.length === 1) {
        setSmooth(false); moved = false; pinch = null;
        tpan = { sx: e.touches[0]!.clientX - tRef.current.ox, sy: e.touches[0]!.clientY - tRef.current.oy };
        e.preventDefault();
      } else if (e.touches.length === 2) {
        setSmooth(false); tpan = null;
        const r = board.getBoundingClientRect(), a = e.touches[0]!, b = e.touches[1]!;
        pinch = { d0: dist(a, b), s0: tRef.current.scale, mx: (a.clientX + b.clientX) / 2 - r.left, my: (a.clientY + b.clientY) / 2 - r.top, ox0: tRef.current.ox, oy0: tRef.current.oy };
        e.preventDefault();
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length >= 2 && pinch.d0 > 0) {
        e.preventDefault();
        const ns = clampS(pinch.s0 * (dist(e.touches[0]!, e.touches[1]!) / pinch.d0)), k = ns / pinch.s0;
        setT({ scale: ns, ox: pinch.mx - k * (pinch.mx - pinch.ox0), oy: pinch.my - k * (pinch.my - pinch.oy0) });
      } else if (tpan && e.touches.length === 1) {
        e.preventDefault(); moved = true;
        // capture offsets as primitives — never deref tpan/the Touch inside the updater,
        // which React can replay after touchend has nulled tpan (intermittent crash).
        const nox = e.touches[0]!.clientX - tpan.sx, noy = e.touches[0]!.clientY - tpan.sy;
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

  // keyboard navigation — hold arrows / WASD to glide the canvas and +/− to zoom (so traversing isn't
  // endless dragging). Momentum model: pan AND zoom velocities ease toward a target, so a quick tap is a
  // fine nudge and a held key is a smooth cruise, with a short glide-out on release. Speed tiers use ONLY
  // browser-safe keys — Shift = sprint, Space = slow/precise — and any Ctrl/Cmd/Alt combo is ignored,
  // because the OS/browser steal those: mac Ctrl+←/→ switches Spaces, Windows Ctrl+W closes the tab,
  // Cmd/Alt+← go back, Cmd/Ctrl +/− is browser zoom. Shift is the only modifier left untouched. Keys are
  // read by e.code (physical position) so they're layout-proof, numpad-aware, and never stick when Shift
  // is released before the key. F frames the whole graph (Fit).
  const openCardRef = useRef(openCard); useEffect(() => { openCardRef.current = openCard; }, [openCard]);
  // true once the CardModal is actually mounted (card loaded). While the loading scrim shows, CardModal's
  // own Escape listener isn't there yet, so the canvas handler covers Escape until it takes over.
  const cardReadyRef = useRef(false); useEffect(() => { cardReadyRef.current = !!(card && card.recipeId === openCard); }, [card, openCard]);
  const fitRef = useRef(fit); useEffect(() => { fitRef.current = fit; }, [fit]);
  useEffect(() => {
    const ACT: Record<string, string> = {
      ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
      ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
      Equal: "zin", NumpadAdd: "zin", Minus: "zout", NumpadSubtract: "zout",
    };
    const down = new Set<string>();
    const vel = { x: 0, y: 0, z: 0 };           // pan x/y (px/sec) + zoom z (e-folds/sec)
    let raf = 0, last = 0;
    const PAN = 1150, ZOOM = 1.9, SPRINT = 2.5, SLOW = 0.3;
    const ACCEL = 11, FRICTION = 14;

    const tick = (ts: number) => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
      last = ts;
      let dx = 0, dy = 0, dz = 0;
      if (down.has("left")) dx += 1;
      if (down.has("right")) dx -= 1;
      if (down.has("up")) dy += 1;
      if (down.has("down")) dy -= 1;
      if (down.has("zin")) dz += 1;
      if (down.has("zout")) dz -= 1;
      if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; } // even speed on the diagonal
      const active = dx !== 0 || dy !== 0 || dz !== 0;
      const mult = down.has("shift") ? SPRINT : down.has("space") ? SLOW : 1;
      const ease = 1 - Math.exp(-(active ? ACCEL : FRICTION) * dt);
      vel.x += (dx * PAN * mult - vel.x) * ease;
      vel.y += (dy * PAN * mult - vel.y) * ease;
      vel.z += (dz * ZOOM * mult - vel.z) * ease;
      if (!active && Math.abs(vel.x) < 1.5 && Math.abs(vel.y) < 1.5 && Math.abs(vel.z) < 0.01) {
        vel.x = vel.y = vel.z = 0; raf = 0; last = 0;
        pushHist(tRef.current);  // one history entry per glide, just like a drag
        return;
      }
      const vx = vel.x, vy = vel.y, vz = vel.z;
      const board = boardRef.current, cx = (board?.clientWidth ?? 0) / 2, cy = (board?.clientHeight ?? 0) / 2;
      setT((p) => {
        let ox = p.ox + vx * dt, oy = p.oy + vy * dt, scale = p.scale;
        if (vz !== 0) { const ns = clampS(scale * Math.exp(vz * dt)), k = ns / scale; ox = cx - k * (cx - ox); oy = cy - k * (cy - oy); scale = ns; } // zoom around the viewport centre
        return { ox, oy, scale };
      });
      raf = requestAnimationFrame(tick);
    };
    const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };

    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName ?? "";
      if (el?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // ONLY text entry blocks canvas keys — a focused button/link must not, else you'd have to click the canvas to pan again after Tab/?
      if (openCardRef.current) { if (e.code === "Backspace" || (e.code === "Escape" && !cardReadyRef.current)) { e.preventDefault(); closeCard(); } return; } // card open: ⌫ closes it; Esc too while still loading (once mounted, CardModal owns Esc), else everything goes to the modal
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // never hijack real OS/browser shortcuts (Ctrl+W, Cmd±, …)
      if (e.code === "KeyL") { e.preventDefault(); setLegendOpen((o) => !o); return; }                  // toggle legend
      if (e.key === "/") { e.preventDefault(); if (drawerOpenRef.current) closeDrawer(); else setDrawerOpen(true); return; } // toggle the recipe finder (open focuses its search, close refocuses the canvas); by character so it's layout-proof and never the "?" key
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") { down.add("shift"); return; }
      if (e.code === "Space") { if (tag === "BUTTON") return; down.add("space"); e.preventDefault(); return; } // let Space activate a focused button instead of "slow"
      if (e.code === "KeyF") { e.preventDefault(); fitRef.current(); return; }
      const a = ACT[e.code];
      if (!a) return;
      e.preventDefault();          // stop arrows/space from scrolling the page
      down.add(a);
      setSmooth(false);
      run();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") { down.delete("shift"); return; }
      if (e.code === "Space") { down.delete("space"); return; }
      const a = ACT[e.code];
      if (a) down.delete(a);       // friction eases it to a stop
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
    if (drawerOpen) { closeDrawer(); return; }                // click the canvas to dismiss the recipe drawer (and refocus it for WASD)
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

  // stable so the memoized RecipeNodes don't re-render every pan/zoom frame. No focusBoard() here — the
  // CardModal moves focus into itself on open (focusing the canvas behind it would defeat the trap).
  const openFromNode = useCallback((id: string) => { cameFromDrawerRef.current = false; setCameFromDrawer(false); setDrawerOpen(false); setFocus(id); openCardId(id); }, [openCardId]);
  const pickFromDrawer = (id: string) => { cameFromDrawerRef.current = true; setCameFromDrawer(true); setDrawerOpen(false); centerOn(id); openCardId(id); }; // remember the origin so closing the card (esc / ⌫ / click-away / ← Results) drops you back on your search
  const navInCard = useCallback((id: string) => { centerOn(id); openCardId(id); }, [centerOn, openCardId]);

  // arm labels (A/B/C…) come straight from the bake-off note, so the node badge and the pill agree
  const arm = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of graph.bakeoffs) for (const a of b.note.arms) m.set(a.recipeId, a.label);
    return m;
  }, [graph.bakeoffs]);

  // bake-off brackets (2-arm curve or N-arm comb) — geometry lives in buildConnectors
  const connectors = useMemo(() => buildConnectors(graph.bakeoffs, posMap), [graph.bakeoffs, posMap]);

  return (
    <div className="treepage">
      <div className="board" ref={boardRef} tabIndex={-1} onMouseDown={onDown}>
        <div className={`scene${t.scale < FAR_SCALE ? " far" : ""}${smooth ? " smooth" : ""}`} style={{ transform: `translate(${t.ox}px,${t.oy}px) scale(${t.scale})`, ["--z" as string]: t.scale, width, height, transition: smooth ? "transform .26s cubic-bezier(.22,.61,.36,1)" : "none" }}>
          <EdgeLayer edges={graph.edges} pos={posMap} connectors={connectors} width={width} height={height} />
          {graph.nodes.map((n) => <RecipeNode key={n.recipeId} node={n} pos={posMap.get(n.recipeId)!} arm={arm.get(n.recipeId)} selected={focus === n.recipeId} onOpen={openFromNode} />)}
          {connectors.map((c, i) => <BakeoffPill key={i} note={c.note} pos={{ x: c.mx, y: c.my }} />)}
        </div>
      </div>

      <div className="tctl tl">
        <button className={`fbtn${drawerOpen ? " on" : ""}`} onClick={() => { if (drawerOpen) closeDrawer(); else setDrawerOpen(true); }} aria-label={drawerOpen ? "Close recipes" : "Open recipes"}>{drawerOpen ? "✕ Recipes" : "☰ Recipes"}</button>
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

      <div className="panhint">WASD / arrows move · +/− zoom · F fit · L legend · / find · ? shortcuts</div>

      <div className={`drawer${drawerOpen ? " open" : ""}`} ref={drawerRef} aria-hidden={!drawerOpen}>
        <TreeOutline graph={graph} focus={focus} open={drawerOpen} onPick={pickFromDrawer} onClose={closeDrawer} />
      </div>

      {openCard && (card && card.recipeId === openCard
        ? <CardModal key={openCard} card={card} onClose={closeCard} onNavigate={navInCard} onBack={cameFromDrawer ? backToResults : undefined} />
        : <div className="cmodal" role="dialog" aria-modal="true" aria-label="Loading recipe" onMouseDown={closeCard}><div className="cmodal-loading">Loading…</div></div>)}
    </div>
  );
}
