import type { QueueVM, QueueItemVM, QueueLaneVM } from "../../lib/viewmodel/queue";
import { isRatioWarn } from "../../lib/viewmodel/format";

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

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
        {r0(item.cal)} cal · {item.calPerGramProtein != null ? <>{r1(item.calPerGramProtein)}{ratioHot && <span className="rdot" role="img" aria-label="lean-light: high cal per gram protein" title="high cal/g protein — lean-light for a protein recipe" />} cal/g</> : "—"}
      </span>
    </a>
  );
}

function Col({ title, items, nb }: { title: string; items: QueueItemVM[]; nb?: boolean }) {
  return (
    <div className={`qb-col${nb ? " nb" : ""}`}>
      <div className="q-gt">{title}<span className="q-ct">{items.length}</span></div>
      {items.length ? items.map((item) => <Row key={item.recipeId} item={item} />) : <div className="q-empty">— nothing here —</div>}
    </div>
  );
}

function Lane({ label, sub, lane }: { label: string; sub: string; lane: QueueLaneVM }) {
  const total = lane.bake.length + lane.noBake.length;
  return (
    <section className="qb-lane">
      <div className="qb-lh"><h2 className="q-lt">{label}</h2><span className="q-lct">{total}</span><span className="q-lsub">{sub}</span></div>
      <div className="qb-cols">
        <Col title="Bake" items={lane.bake} />
        <Col title="No-bake" items={lane.noBake} nb />
      </div>
    </section>
  );
}

/** The cooking queue as a full page: two lanes (the to-make backlog + proven favourites), each laying
 *  Bake and No-bake side by side so the whole plan reads at a glance with little scrolling. Rows link
 *  to the recipe's full page. Ordering + grouping come from buildQueue(); this is presentation only. */
export function QueueBoard({ queue }: { queue: QueueVM }) {
  return (
    <main className="qb">
      <div className="qb-head">
        <h1 className="qb-title">Cooking queue</h1>
        <p className="qb-sub">Ranked by recommendation — produce first (apple · carrot · lemon · banana · blueberry, to use perishables), then leanest cal/g-protein. Bake and no-bake sit side by side so you can run one of each at once.</p>
      </div>
      <Lane label="Make next" sub="your to-make backlog" lane={queue.makeNext} />
      <Lane label="Make again" sub="proven favourites worth repeating" lane={queue.makeAgain} />
    </main>
  );
}
