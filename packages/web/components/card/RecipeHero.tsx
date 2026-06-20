import type { BakeCardVM } from "../../lib/viewmodel/types";
import { splitName, r0, r1 } from "../../lib/viewmodel/format";

export function RecipeHero({ card, fullHref }: { card: BakeCardVM; fullHref?: string }) {
  const { title, paren } = splitName(card.name);
  const ps = card.perServing, w = card.whole, unit = card.yield.unit;
  const planned = !card.made;
  return (
    <div className="hero">
      <h1 className="htitle">{title} {paren && <span className="q">{paren}</span>}</h1>
      <div className="hmeta">
        <span className="hhash">{card.shortSha} · main</span>
        {planned
          ? <span className="status plan"><span className="d" /> TO-MAKE</span>
          : <span className="status"><span className="d" /> {card.rating ? card.rating.toUpperCase() : "MADE"}</span>}
        {card.basis === "partial" && <span className="branchchip">macros <b>estimated</b></span>}
        {card.tags.length > 0 && <span className="tags">{card.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>}
        {fullHref && <a className="hopen" href={fullHref} target="_blank" rel="noreferrer">open full page ↗</a>}
      </div>
      {card.description && <p className="lede">{card.description}</p>}
      <div className="macrobar">
        <div className="mc"><div className="v">{r0(ps.calories)} <small>kcal</small></div><div className="k">per {unit}</div></div>
        <div className="mc"><div className="v">{r1(ps.protein)} <small>g</small></div><div className="k">protein</div></div>
        <div className="mc accent"><div className="v">{card.calPerGramProtein != null ? r1(card.calPerGramProtein) : "—"}</div><div className="k">cal / g protein</div></div>
        <div className="mc"><div className="v">{card.yield.amount}</div><div className="k">makes</div></div>
      </div>
      <div className="macrosub">per {unit} — carbs {r1(ps.carbs)}g · fat {r1(ps.fat)}g · fiber {r1(ps.fiber)}g &nbsp;·&nbsp; <span className="w">whole batch ({card.yield.amount}): {r0(w.calories)} cal · {r1(w.protein)}P · {r1(w.carbs)}C · {r1(w.fat)}F</span></div>
    </div>
  );
}
