import type { IngredientGroupVM } from "../../lib/viewmodel/types";
import { r0 } from "../../lib/viewmodel/format";

export function IngredientList({ groups }: { groups: IngredientGroupVM[] }) {
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="block">
      <div className="sh">Ingredients <span className="kc">{count} items</span></div>
      {groups.map((g) => (
        <div className="ggroup" key={g.title}>
          <div className="gh"><span>{g.title} {g.subRecipe && <span className="sub">· sub-recipe</span>}</span> <span className="kc">{r0(g.calories)} cal</span></div>
          {g.items.map((it, i) => (
            <div className="ing" key={i}>
              <span className="q">{it.qtyNatural}</span>
              <span className="nm">{it.name}</span>
              <span className="g">{it.grams != null && !/\bg$/.test(it.qtyNatural) ? `${it.grams} g` : ""}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
