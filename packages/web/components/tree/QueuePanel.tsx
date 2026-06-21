"use client";
import { useEffect } from "react";
import type { TreeGraphVM } from "../../lib/viewmodel/types";
import { buildQueue, type QueueItemVM, type QueueLaneVM } from "../../lib/viewmodel/queue";

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

function Row({ item, onPick }: { item: QueueItemVM; onPick: (id: string) => void }) {
  return (
    <div className="q-row" role="button" tabIndex={0}
      onClick={() => onPick(item.recipeId)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(item.recipeId); } }}>
      <span className="q-nm">
        {item.name}
        {item.produce && <span className="q-prod">{item.produce}</span>}
        {item.rating === "excellent" && <span className="star" aria-label="excellent">★</span>}
      </span>
      <span className="q-mac">
        {r0(item.cal)} cal · {item.calPerGramProtein != null ? `${r1(item.calPerGramProtein)} cal/g` : "—"}
      </span>
    </div>
  );
}

function Group({ title, items, nb, onPick }: { title: string; items: QueueItemVM[]; nb?: boolean; onPick: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className={`q-grp${nb ? " nb" : ""}`}>
      <div className="q-gt">{title}<span className="q-ct">{items.length}</span></div>
      {items.map((item) => <Row key={item.recipeId} item={item} onPick={onPick} />)}
    </div>
  );
}

function Lane({ label, sub, lane, onPick }: { label: string; sub: string; lane: QueueLaneVM; onPick: (id: string) => void }) {
  const total = lane.bake.length + lane.noBake.length;
  return (
    <div className="q-lane">
      <div className="q-lh"><span className="q-lt">{label}</span><span className="q-lct">{total}</span></div>
      <div className="q-lsub">{sub}</div>
      <Group title="Bake" items={lane.bake} onPick={onPick} />
      <Group title="No-bake" items={lane.noBake} nb onPick={onPick} />
      {total === 0 && <div className="q-empty">Nothing here yet.</div>}
    </div>
  );
}

/** The "Make next" planning drawer: a curated cooking queue split into two lanes — the to-make
 *  backlog and proven favourites worth repeating — each grouped bake vs no-bake (so you can pair one
 *  oven + one no-oven for a concurrent session) and ordered produce-first then leanest. Picking a row
 *  centres + opens that recipe. Escape closes it. */
export function QueuePanel({ graph, open, onPick, onClose }: {
  graph: TreeGraphVM; open: boolean; onPick: (id: string) => void; onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const q = buildQueue(graph.nodes);
  return (
    <div className="q-inner">
      <div className="q-head">
        <span className="dt">Cooking queue</span>
        <button className="q-x" onClick={onClose} aria-label="Close queue">✕</button>
      </div>
      <div className="q-sub">Ranked by recommendation — produce first (carrot · lemon · apple), then leanest. Bake / no-bake split so you can run one of each at once.</div>
      <div className="q-scroll">
        <Lane label="Make next" sub="your to-make backlog" lane={q.makeNext} onPick={onPick} />
        <Lane label="Make again" sub="proven favourites worth repeating" lane={q.makeAgain} onPick={onPick} />
      </div>
    </div>
  );
}
