import Link from "next/link";
import type { BakeCardVM } from "../../lib/viewmodel/types";

const ICON = { "forked-from": "↟", "composes": "┄", "sibling": "⎇" } as const;
const META = { "forked-from": "forked from", "composes": "composes", "sibling": "sibling branch" } as const;

/** `onNavigate`, when supplied (modal context), swaps the open card to the clicked
 *  relative instead of routing to a separate page — keeps you inside the overlay. */
export function Lineage({ items, onNavigate }: {
  items: BakeCardVM["lineage"]; onNavigate?: (recipeId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="block">
      <div className="sh">Lineage</div>
      {items.map((it, i) => {
        const inner = (<><span className={`ic${it.rel === "forked-from" ? "" : " c"}`}>{ICON[it.rel]}</span><span className="nm">{it.name}</span><span className="meta">{META[it.rel]}</span></>);
        if (!it.recipeId) return <div className="lrow" key={i}>{inner}</div>;
        if (onNavigate) {
          const id = it.recipeId;
          return <div className="lrow" role="button" tabIndex={0} key={i} onClick={() => onNavigate(id)} onKeyDown={(e) => { if (e.key === "Enter") onNavigate(id); }}>{inner}</div>;
        }
        return <Link className="lrow" key={i} href={`/r/${it.recipeId}`}>{inner}</Link>;
      })}
    </div>
  );
}
