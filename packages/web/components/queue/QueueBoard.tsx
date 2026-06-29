"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QueueVM, QueueItemVM, QueueLaneVM } from "../../lib/viewmodel/queue";
import { isRatioWarn, r0, r1 } from "../../lib/viewmodel/format";
import { matchesSearch } from "../../lib/search";
import { SearchBox } from "../shared/SearchBox";
import { RatioDot } from "../shared/RatioDot";

const laneCount = (l: QueueLaneVM) => l.bake.length + l.noBake.length;

function Row({ item }: { item: QueueItemVM }) {
  const ratioHot = isRatioWarn(item.calPerGramProtein, false);
  return (
    <a className="q-row" href={`/r/${item.recipeId}`}>
      <span className="q-nm">
        {item.name}
        {item.produce && <span className="q-prod">{item.produce}</span>}
        {item.rating === "excellent" && <span className="star" aria-label="excellent">★</span>}
      </span>
      <span className="q-mac">
        {r0(item.cal)} cal · {item.calPerGramProtein != null ? <>{r1(item.calPerGramProtein)}<RatioDot warn={ratioHot} /> cal/g</> : "—"}
      </span>
    </a>
  );
}

function Col({ title, items, nb, searching }: { title: string; items: QueueItemVM[]; nb?: boolean; searching: boolean }) {
  if (searching && !items.length) return null; // while filtering, drop empty columns instead of showing "nothing here"
  return (
    <div className={`qb-col${nb ? " nb" : ""}`}>
      <div className="q-gt">{title}<span className="q-ct">{items.length}</span></div>
      {items.length ? items.map((item) => <Row key={item.recipeId} item={item} />) : <div className="q-empty">— nothing here —</div>}
    </div>
  );
}

function Lane({ label, sub, lane, searching }: { label: string; sub: string; lane: QueueLaneVM; searching: boolean }) {
  const total = laneCount(lane);
  if (searching && total === 0) return null; // a lane with no matches disappears entirely while filtering
  return (
    <section className="qb-lane">
      <div className="qb-lh"><h2 className="q-lt">{label}</h2><span className="q-lct">{total}</span><span className="q-lsub">{sub}</span></div>
      <div className={`qb-cols${searching ? " qf" : ""}`}>
        <Col title="Bake" items={lane.bake} searching={searching} />
        <Col title="No-bake" items={lane.noBake} nb searching={searching} />
      </div>
    </section>
  );
}

/** The cooking queue as a full page: two lanes (the to-make backlog + proven favourites), each laying
 *  Bake and No-bake side by side so the whole plan reads at a glance with little scrolling. A search
 *  box filters every lane/column live (shared matcher, same as the tree drawer + recipes table); "/"
 *  focuses it, Enter opens the top match, and empty lanes/columns collapse so a filtered view stays
 *  tight. Ordering + grouping come from buildQueue(); this is presentation only. */
export function QueueBoard({ queue }: { queue: QueueVM }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const boxRef = useRef<HTMLInputElement>(null);

  const searching = q.trim().length > 0;
  const { makeNext, makeAgain, first } = useMemo(() => {
    const match = (it: QueueItemVM) => matchesSearch([it.name, it.family, ...it.tags], q);
    const filterLane = (l: QueueLaneVM): QueueLaneVM => ({ bake: l.bake.filter(match), noBake: l.noBake.filter(match) });
    const mn = filterLane(queue.makeNext), ma = filterLane(queue.makeAgain);
    // the top match in rank order — what Enter opens
    const first = [...mn.bake, ...mn.noBake, ...ma.bake, ...ma.noBake][0] ?? null;
    return { makeNext: mn, makeAgain: ma, first };
  }, [queue, q]);

  const totalAll = laneCount(queue.makeNext) + laneCount(queue.makeAgain);
  const matchedAll = laneCount(makeNext) + laneCount(makeAgain);

  // "/" focuses the queue search — the same find hotkey as the tree, so the gesture is consistent
  // across surfaces. Ignored while typing in any field so it stays a literal character there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName ?? "";
      if (el?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); boxRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="qb">
      <div className="qb-head">
        <h1 className="qb-title">Cooking queue</h1>
        <p className="qb-sub">Ranked by recommendation — produce first (apple · carrot · lemon · banana · blueberry, to use perishables), then leanest cal/g-protein. Bake and no-bake sit side by side so you can run one of each at once.</p>
        <div className="qb-search">
          <SearchBox ref={boxRef} value={q} onChange={setQ}
            placeholder="Search the queue by name, family, or tag…"
            ariaLabel="Search the cooking queue"
            onEnter={() => { if (first) router.push(`/r/${first.recipeId}`); }} />
          <span className="qb-ct" aria-live="polite">{searching ? `${matchedAll} of ${totalAll} match` : `${totalAll} queued`}<kbd className="qb-key">/</kbd></span>
        </div>
      </div>
      {searching && matchedAll === 0 ? (
        <div className="qb-nomatch">No queued recipes match “{q.trim()}”.</div>
      ) : (
        <>
          <Lane label="Make next" sub="your to-make backlog" lane={makeNext} searching={searching} />
          <Lane label="Make again" sub="proven favourites worth repeating" lane={makeAgain} searching={searching} />
        </>
      )}
    </main>
  );
}
