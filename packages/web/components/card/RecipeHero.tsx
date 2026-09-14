import type { BakeCardVM } from "../../lib/viewmodel/types";
import { splitName, r0, r1, isRatioWarn } from "../../lib/viewmodel/format";
import { RatioDot } from "../shared/RatioDot";
import { Mark, type MarkKind } from "../shared/Mark";

export function RecipeHero({ card }: { card: BakeCardVM }) {
  const { title, paren } = splitName(card.name);
  const ps = card.perServing, w = card.whole, unit = card.yield.unit, n = card.yield.amount;
  const isSub = card.tags.includes("sub-recipe");
  const one = /[^s]s$/.test(unit) ? unit.slice(0, -1) : unit; // "per slice", not "per slices"
  // the state mark: open = to-make, double = excellent, struck = bad, filled = made (good / okay / unrated)
  const mark: MarkKind = !card.made ? "open" : card.rating === "excellent" ? "double" : card.rating === "bad" ? "struck" : "filled";
  const ratioHot = isRatioWarn(card.calPerGramProtein, isSub);
  return (
    <header className="hero">
      <div className="hmain">
        <h1 className="htitle">{title} {paren && <span className="q">{paren}</span>}</h1>
        <div className="hmeta">
          <span className="hhash">{card.shortSha} · main</span>
          <span className="status"><Mark kind={mark} /> {card.made ? (card.rating ?? "made") : "to-make"}</span>
          {card.basis === "partial" && <span className="cell">macros estimated</span>}
          {card.tags.length > 0 && <span className="tags">{card.tags.map((t) => <span key={t} className="cell">{t}</span>)}</span>}
        </div>
        {card.description && <p className="lede">{card.description}</p>}
      </div>
      <table className="hledger">
        <thead>
          <tr><th scope="col">per {one}</th><th scope="col" className="r">makes {n} {unit}</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">calories</th><td>{r0(ps.calories)}<span className="u">kcal</span></td></tr>
          <tr><th scope="row">protein</th><td>{r1(ps.protein)}<span className="u">g</span></td></tr>
          <tr className="hi"><th scope="row">cal / g protein</th><td>{card.calPerGramProtein != null ? r1(card.calPerGramProtein) : "—"}<RatioDot warn={ratioHot} /></td></tr>
          <tr><th scope="row">carbs · fat · fiber</th><td>{r1(ps.carbs)} · {r1(ps.fat)} · {r1(ps.fiber)}<span className="u">g</span></td></tr>
          <tr className="sep"><th scope="row" colSpan={2}>whole batch</th></tr>
          <tr><th scope="row">calories</th><td>{r0(w.calories).toLocaleString("en-US")}<span className="u">kcal</span></td></tr>
          <tr><th scope="row">protein</th><td>{r1(w.protein)}<span className="u">g</span></td></tr>
          <tr><th scope="row">carbs · fat</th><td>{r1(w.carbs)} · {r1(w.fat)}<span className="u">g</span></td></tr>
        </tbody>
      </table>
    </header>
  );
}
