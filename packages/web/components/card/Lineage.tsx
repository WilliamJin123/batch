import Link from "next/link";
import type { BakeCardVM } from "../../lib/viewmodel/types";

const ICON = { "forked-from": "↟", "composes": "┄", "sibling": "⎇" } as const;
const META = { "forked-from": "forked from", "composes": "composes", "sibling": "sibling branch" } as const;

export function Lineage({ items }: { items: BakeCardVM["lineage"] }) {
  if (items.length === 0) return null;
  return (
    <div className="block">
      <div className="sh">Lineage</div>
      {items.map((it, i) => {
        const inner = (<><span className={`ic${it.rel === "forked-from" ? "" : " c"}`}>{ICON[it.rel]}</span><span className="nm">{it.name}</span><span className="meta">{META[it.rel]}</span></>);
        return it.recipeId
          ? <Link className="lrow" key={i} href={`/r/${it.recipeId}`}>{inner}</Link>
          : <div className="lrow" key={i}>{inner}</div>;
      })}
    </div>
  );
}
